// Casos de uso de una reserva de mesa: crear, editar y cambiar de estado.
// Los usan tanto el panel como la página pública; los controladores solo
// traducen HTTP <-> estas funciones. Cada función devuelve
// { ok:true, ... } o { ok:false, status, codigo, mensaje, ...extra }.
import ReservaMesa, { ORIGENES_RESERVA_MESA, MOTIVOS_CANCELACION_MESA } from "../../models/reservaMesa.model.js";
import BloqueoReservaMesa from "../../models/bloqueoReservaMesa.model.js";
import { validarSolicitud, CANAL_PANEL, CANAL_WEB } from "./reglas.js";
import { disponibilidadDelDia, buscarAlternativas } from "./disponibilidad.js";
import { tomarCupo, liberarCupo } from "./ocupacion.js";
import {
  ESTADOS_QUE_OCUPAN,
  ESTADOS_EDITABLES,
  ocupaCupo,
  validarCambioEstado,
} from "./transiciones.js";
import { hoyChile, esFechaValida, esHoraValida } from "./tiempo.js";
import {
  generarCodigo,
  normalizarTelefono,
  esTelefonoValido,
  esEmailValido,
  limpiarTexto,
  generarTokenCancelacion,
  entradaHistorial,
  diferencias,
} from "./utilidades.js";

const error = (status, codigo, mensaje, extra = {}) => ({ ok: false, status, codigo, mensaje, ...extra });

const STATUS_POR_CODIGO = {
  SIN_CONFIGURAR: 409,
  SIN_CUPO: 409,
  BLOQUEADO: 409,
  DIA_CERRADO: 400,
  HORA_FUERA_DE_HORARIO: 400,
  MUY_PRONTO: 400,
  MUY_LEJOS: 400,
  EN_PASADO: 400,
  GRUPO_GRANDE: 400,
  SECTOR_INVALIDO: 400,
  DATOS_INVALIDOS: 400,
};

/* ─────────── Datos del cliente y extras ─────────── */

const normalizarEntrada = (entrada, canal) => {
  const nombre = limpiarTexto(entrada.nombre, 80);
  const telefono = limpiarTexto(entrada.telefono, 25);
  const email = limpiarTexto(entrada.email, 120).toLowerCase();

  if (nombre.length < 2) return { error: "Ingresa el nombre de quien reserva" };
  if (!esTelefonoValido(telefono)) return { error: "Ingresa un teléfono válido" };
  if (canal === CANAL_WEB && !email) return { error: "Ingresa tu correo para enviarte la confirmación" };
  if (email && !esEmailValido(email)) return { error: "El correo no es válido" };

  let origen = canal === CANAL_WEB ? "web" : entrada.origen || "telefono";
  if (canal === CANAL_PANEL && (!ORIGENES_RESERVA_MESA.includes(origen) || origen === "web")) {
    return { error: "El origen de la reserva no es válido" };
  }

  const es = !!entrada.cumpleanos?.es;
  return {
    datos: {
      cliente: {
        nombre,
        telefono,
        telefonoNormalizado: normalizarTelefono(telefono),
        email,
      },
      cumpleanos: {
        es,
        festejado: es ? limpiarTexto(entrada.cumpleanos?.festejado, 80) : "",
        detalle: es ? limpiarTexto(entrada.cumpleanos?.detalle, 300) : "",
      },
      comentarios: limpiarTexto(entrada.comentarios, 500),
      origen,
    },
  };
};

const conAlternativas = async ({ empresaId, config, fecha, hora, personas, sectorId, canal, descontar, ahora }) => {
  try {
    const disp = await disponibilidadDelDia({ empresaId, config, fecha, personas, canal, descontar, ahora });
    return buscarAlternativas(disp, { hora, sectorId });
  } catch {
    return [];
  }
};

const posiblesDuplicados = (empresaId, telefonoNormalizado, inicio, fin, excluirId = null) =>
  ReservaMesa.find({
    empresa: empresaId,
    "cliente.telefonoNormalizado": telefonoNormalizado,
    estado: { $in: ESTADOS_QUE_OCUPAN },
    inicio: { $lt: fin },
    fin: { $gt: inicio },
    ...(excluirId ? { _id: { $ne: excluirId } } : {}),
  })
    .select("codigo cliente.nombre fecha hora personas sector estado")
    .lean();

/** Intenta tomar cupo; si no alcanza y hay permiso, toma con sobrecupo. */
const tomarConPermiso = async ({ empresaId, sector, franjas, personas, forzar }) => {
  const normal = await tomarCupo({
    empresa: empresaId,
    sector: sector._id,
    franjas,
    personas,
    capacidad: sector.capacidad,
  });
  if (normal.ok) return { ok: true, sobrecupo: false };
  if (!forzar) return { ok: false };
  await tomarCupo({ empresa: empresaId, sector: sector._id, franjas, personas, forzar: true });
  return { ok: true, sobrecupo: true };
};

/* ─────────── Crear ─────────── */

export const crearReserva = async ({
  empresaId,
  config,
  entrada,
  canal = CANAL_PANEL,
  actor = null,
  puedeForzar = false,
  ahora = new Date(),
}) => {
  const { datos, error: errorDatos } = normalizarEntrada(entrada, canal);
  if (errorDatos) return error(400, "DATOS_INVALIDOS", errorDatos);

  // Doble clic / reenvío: misma clave = misma reserva
  const clave = limpiarTexto(entrada.claveIdempotencia, 80) || null;
  if (clave) {
    const repetida = await ReservaMesa.findOne({ empresa: empresaId, claveIdempotencia: clave });
    if (repetida) return { ok: true, reserva: repetida, repetida: true };
  }

  const { fecha, hora, sectorId } = entrada;
  // Formato antes de usar estos valores en cualquier consulta
  if (!esFechaValida(fecha) || !esHoraValida(hora)) {
    return error(400, "DATOS_INVALIDOS", "La fecha u hora no son válidas");
  }
  const bloqueos = await BloqueoReservaMesa.find({ empresa: empresaId, fecha }).lean();
  const v = validarSolicitud({
    config,
    fecha,
    hora,
    personas: entrada.personas,
    sectorId,
    canal,
    bloqueos,
    ahora,
  });
  if (!v.ok) {
    const extra = ["SIN_CUPO", "BLOQUEADO"].includes(v.codigo)
      ? { alternativas: await conAlternativas({ empresaId, config, fecha, hora, personas: Number(entrada.personas), sectorId, canal, ahora }) }
      : {};
    return error(STATUS_POR_CODIGO[v.codigo] || 400, v.codigo, v.mensaje, extra);
  }

  // Duplicados: mismo teléfono con una reserva activa que se cruza en horario
  const duplicados = await posiblesDuplicados(empresaId, datos.cliente.telefonoNormalizado, v.inicio, v.fin);
  if (duplicados.length) {
    if (canal === CANAL_WEB) {
      const d = duplicados[0];
      return error(
        409,
        "DUPLICADA",
        `Ya tienes una reserva para el ${d.fecha} a las ${d.hora} (código ${d.codigo}).`,
      );
    }
    if (!entrada.confirmarDuplicado) {
      return error(409, "POSIBLE_DUPLICADO", "Ese teléfono ya tiene una reserva que se cruza con este horario.", {
        duplicados,
      });
    }
  }

  const quiereForzar = canal === CANAL_PANEL && !!entrada.forzarSobrecupo;
  if (quiereForzar && !puedeForzar) {
    return error(403, "SIN_PERMISO", "No tienes permiso para registrar sobrecupo");
  }

  const cupo = await tomarConPermiso({
    empresaId,
    sector: v.sector,
    franjas: v.franjas,
    personas: v.personas,
    forzar: quiereForzar,
  });
  if (!cupo.ok) {
    return error(409, "SIN_CUPO", `No hay lugar para ${v.personas} personas en ${v.sector.nombre} a las ${hora}.`, {
      alternativas: await conAlternativas({ empresaId, config, fecha, hora, personas: v.personas, sectorId, canal, ahora }),
      puedeForzar: canal === CANAL_PANEL && puedeForzar,
    });
  }

  const estado =
    canal === CANAL_WEB && !config.confirmacionAutomaticaWeb ? "pendiente" : "confirmada";
  const token = datos.cliente.email ? generarTokenCancelacion() : null;

  const historial = [
    entradaHistorial(actor, "creada", {
      detalle: canal === CANAL_WEB ? "Reserva hecha desde la web" : `Registrada en el panel (${datos.origen})`,
    }),
  ];
  if (cupo.sobrecupo) {
    historial.push(entradaHistorial(actor, "sobrecupo", { detalle: "Se registró sin cupo disponible (autorizado)" }));
  }

  // El código corto es aleatorio: si choca con uno existente, se reintenta
  for (let intento = 0; intento < 5; intento++) {
    try {
      const reserva = await ReservaMesa.create({
        empresa: empresaId,
        codigo: generarCodigo(),
        ...datos,
        fecha,
        hora,
        inicio: v.inicio,
        fin: v.fin,
        personas: v.personas,
        sector: { id: v.sector._id, nombre: v.sector.nombre },
        franjas: v.franjas,
        ocupaCupo: true,
        sobrecupo: cupo.sobrecupo,
        estado,
        historial,
        creadaPor: actor?.id || null,
        claveIdempotencia: clave,
        tokensCancelacion: token ? [token.hash] : [],
      });
      return { ok: true, reserva, tokenCancelacion: token?.token || null };
    } catch (e) {
      const campo = Object.keys(e?.keyPattern || {});
      if (e?.code === 11000 && campo.includes("codigo")) continue;

      // Cualquier otro error: el cupo tomado se devuelve
      await liberarCupo({ empresa: empresaId, sector: v.sector._id, franjas: v.franjas, personas: v.personas });
      if (e?.code === 11000 && campo.includes("claveIdempotencia")) {
        const repetida = await ReservaMesa.findOne({ empresa: empresaId, claveIdempotencia: clave });
        if (repetida) return { ok: true, reserva: repetida, repetida: true };
      }
      throw e;
    }
  }
  await liberarCupo({ empresa: empresaId, sector: v.sector._id, franjas: v.franjas, personas: v.personas });
  return error(500, "ERROR", "No se pudo generar el código de la reserva, intenta de nuevo");
};

/* ─────────── Editar ─────────── */

const CAMPOS_HISTORIAL = ["nombre", "telefono", "email", "fecha", "hora", "personas", "sector", "cumpleanos", "comentarios", "origen"];

const vistaPlana = (r) => ({
  nombre: r.cliente.nombre,
  telefono: r.cliente.telefono,
  email: r.cliente.email,
  fecha: r.fecha,
  hora: r.hora,
  personas: r.personas,
  sector: r.sector.nombre,
  cumpleanos: r.cumpleanos?.es ? `${r.cumpleanos.festejado || "sí"}${r.cumpleanos.detalle ? ` (${r.cumpleanos.detalle})` : ""}` : "no",
  comentarios: r.comentarios,
  origen: r.origen,
});

export const editarReserva = async ({
  empresaId,
  config,
  reserva,
  entrada,
  actor,
  puedeForzar = false,
  ahora = new Date(),
}) => {
  if (!ESTADOS_EDITABLES.includes(reserva.estado)) {
    return error(409, "NO_EDITABLE", "Esta reserva ya no se puede editar");
  }

  const antes = vistaPlana(reserva);
  const combinado = {
    nombre: entrada.nombre ?? reserva.cliente.nombre,
    telefono: entrada.telefono ?? reserva.cliente.telefono,
    email: entrada.email ?? reserva.cliente.email,
    // Una reserva web sigue siendo web (el origen no se edita); se valida
    // con un origen de panel cualquiera solo para no rechazarla.
    origen: reserva.origen === "web" ? "telefono" : entrada.origen ?? reserva.origen,
    cumpleanos: entrada.cumpleanos ?? reserva.cumpleanos,
    comentarios: entrada.comentarios ?? reserva.comentarios,
  };
  const { datos, error: errorDatos } = normalizarEntrada(combinado, CANAL_PANEL);
  if (errorDatos) return error(400, "DATOS_INVALIDOS", errorDatos);

  const fecha = entrada.fecha ?? reserva.fecha;
  const hora = entrada.hora ?? reserva.hora;
  const personas = Number(entrada.personas ?? reserva.personas);
  const sectorId = entrada.sectorId ?? String(reserva.sector.id);

  if (!esFechaValida(fecha) || !esHoraValida(hora)) {
    return error(400, "DATOS_INVALIDOS", "La fecha u hora no son válidas");
  }
  const cambiaHorario = fecha !== reserva.fecha || hora !== reserva.hora;
  const cambiaCupo =
    cambiaHorario || personas !== reserva.personas || String(sectorId) !== String(reserva.sector.id);

  let sobrecupo = reserva.sobrecupo;
  let v = null;

  if (cambiaCupo) {
    const bloqueos = cambiaHorario ? await BloqueoReservaMesa.find({ empresa: empresaId, fecha }).lean() : [];
    v = validarSolicitud({
      config,
      fecha,
      hora,
      personas,
      sectorId,
      canal: CANAL_PANEL,
      bloqueos,
      ahora,
      mantieneHorario: !cambiaHorario,
    });
    if (!v.ok) return error(STATUS_POR_CODIGO[v.codigo] || 400, v.codigo, v.mensaje);

    if (entrada.forzarSobrecupo && !puedeForzar) {
      return error(403, "SIN_PERMISO", "No tienes permiso para registrar sobrecupo");
    }

    const anterior = {
      empresa: empresaId,
      sector: reserva.sector.id,
      franjas: reserva.franjas,
      personas: reserva.personas,
    };
    if (reserva.ocupaCupo) await liberarCupo(anterior);

    const cupo = await tomarConPermiso({
      empresaId,
      sector: v.sector,
      franjas: v.franjas,
      personas: v.personas,
      forzar: !!entrada.forzarSobrecupo,
    });
    if (!cupo.ok) {
      // Se devuelve la reserva a como estaba (forzado: ese lugar era suyo)
      if (reserva.ocupaCupo) await tomarCupo({ ...anterior, forzar: true });
      return error(409, "SIN_CUPO", `No hay lugar para ${v.personas} personas en ${v.sector.nombre} a las ${hora}.`, {
        alternativas: await conAlternativas({
          empresaId,
          config,
          fecha,
          hora,
          personas: v.personas,
          sectorId,
          canal: CANAL_PANEL,
          ahora,
          descontar: reserva.ocupaCupo
            ? { sectorId: reserva.sector.id, franjas: reserva.franjas, personas: reserva.personas }
            : null,
        }),
        puedeForzar,
      });
    }
    sobrecupo = cupo.sobrecupo;
  }

  reserva.cliente = datos.cliente;
  reserva.cumpleanos = datos.cumpleanos;
  reserva.comentarios = datos.comentarios;
  reserva.origen = reserva.origen === "web" ? "web" : datos.origen;
  if (v) {
    reserva.fecha = fecha;
    reserva.hora = hora;
    reserva.inicio = v.inicio;
    reserva.fin = v.fin;
    reserva.personas = v.personas;
    reserva.sector = { id: v.sector._id, nombre: v.sector.nombre };
    reserva.franjas = v.franjas;
    reserva.ocupaCupo = true;
    reserva.sobrecupo = sobrecupo;
    if (cambiaHorario) reserva.recordatorioEnviadoEn = null;
  }

  const cambios = diferencias(antes, vistaPlana(reserva), CAMPOS_HISTORIAL);
  if (!cambios) return { ok: true, reserva, sinCambios: true };

  reserva.historial.push(entradaHistorial(actor, "editada", { cambios }));
  if (v && sobrecupo && entrada.forzarSobrecupo) {
    reserva.historial.push(entradaHistorial(actor, "sobrecupo", { detalle: "Edición sin cupo disponible (autorizada)" }));
  }
  await reserva.save();
  return { ok: true, reserva };
};

/* ─────────── Cambiar estado ─────────── */

export const ETIQUETA_ESTADO = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  llego: "Llegó",
  completada: "Completada",
  cancelada: "Cancelada",
  no_asistio: "No asistió",
};

export const cambiarEstadoReserva = async ({
  reserva,
  hacia,
  motivo = "",
  detalle = "",
  por = "local",
  actor = null,
  puedeCancelar = true,
  ahora = new Date(),
}) => {
  if (hacia === "cancelada") {
    if (!puedeCancelar) return error(403, "SIN_PERMISO", "No tienes permiso para cancelar reservas");
    if (!MOTIVOS_CANCELACION_MESA.includes(motivo)) {
      return error(400, "DATOS_INVALIDOS", "Indica el motivo de la cancelación");
    }
  }

  const motivoTexto = hacia === "cancelada" ? motivo : limpiarTexto(detalle || motivo, 300);
  const validacion = validarCambioEstado({
    reserva,
    hacia,
    motivo: motivoTexto,
    hoy: hoyChile(ahora),
  });
  if (!validacion.ok) return error(409, "TRANSICION_INVALIDA", validacion.mensaje);

  const desde = reserva.estado;
  const sector = { empresa: reserva.empresa, sector: reserva.sector.id, franjas: reserva.franjas, personas: reserva.personas };

  if (ocupaCupo(desde) && !ocupaCupo(hacia) && reserva.ocupaCupo) {
    await liberarCupo(sector);
    reserva.ocupaCupo = false;
  } else if (!ocupaCupo(desde) && ocupaCupo(hacia) && !reserva.ocupaCupo) {
    // Corrección de un "no asistió": el cliente está en el local, así que
    // vuelve a ocupar su lugar aunque eso pase la capacidad.
    await tomarCupo({ ...sector, forzar: true });
    reserva.ocupaCupo = true;
  }

  reserva.estado = hacia;
  if (hacia === "llego") reserva.llegadaEn = ahora;
  if (hacia === "completada") reserva.completadaEn = ahora;
  if (hacia === "cancelada") {
    reserva.cancelacion = {
      motivo,
      detalle: limpiarTexto(detalle, 300),
      por: por === "cliente" ? "cliente" : "local",
      fecha: ahora,
    };
  }

  reserva.historial.push(
    entradaHistorial(actor, "estado", {
      detalle: `${ETIQUETA_ESTADO[desde]} → ${ETIQUETA_ESTADO[hacia]}${motivoTexto && hacia !== "cancelada" ? ` · ${motivoTexto}` : ""}${hacia === "cancelada" && detalle ? ` · ${limpiarTexto(detalle, 300)}` : ""}`,
      cambios: { estado: [desde, hacia], ...(hacia === "cancelada" ? { motivo: [null, motivo] } : {}) },
    }),
  );
  await reserva.save();
  return { ok: true, reserva, desde };
};

/** Lo que ve el panel (sin datos internos de seguridad). */
export const reservaParaPanel = (reserva) => {
  const r = typeof reserva.toObject === "function" ? reserva.toObject() : { ...reserva };
  delete r.tokensCancelacion;
  delete r.claveIdempotencia;
  delete r.franjas;
  if (r.whatsapp) r.whatsapp = { ...r.whatsapp, tokenAsistencia: undefined };
  return r;
};
