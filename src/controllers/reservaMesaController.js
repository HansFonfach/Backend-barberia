// Panel interno de reservas de mesa. Los controladores solo traducen HTTP:
// la lógica vive en services/reservasMesa/. La empresa sale SIEMPRE del
// token (req.usuario.empresaId), nunca del body.
import mongoose from "mongoose";
import Empresa from "../models/empresa.model.js";
import ConfiguracionReservasMesa from "../models/configuracionReservasMesa.model.js";
import BloqueoReservaMesa, { TIPOS_BLOQUEO_MESA } from "../models/bloqueoReservaMesa.model.js";
import ReservaMesa, {
  ESTADOS_RESERVA_MESA,
  ORIGENES_RESERVA_MESA,
} from "../models/reservaMesa.model.js";
import {
  configuracionVacia,
  validarConfiguracion,
} from "../services/reservasMesa/configuracion.js";
import { faltantesConfiguracion, tipoBloqueo, FIN_DEL_DIA, CANAL_PANEL, CANAL_WEB } from "../services/reservasMesa/reglas.js";
import { disponibilidadDelDia } from "../services/reservasMesa/disponibilidad.js";
import {
  crearReserva,
  editarReserva,
  cambiarEstadoReserva,
  reservaParaPanel,
} from "../services/reservasMesa/reservas.js";
import { ESTADOS_QUE_OCUPAN } from "../services/reservasMesa/transiciones.js";
import { esFechaValida, esHoraValida, hoyChile, sumarDias } from "../services/reservasMesa/tiempo.js";
import { escaparRegex, limpiarTexto, normalizarTelefono } from "../services/reservasMesa/utilidades.js";
import {
  correoReservaCliente,
  correoReservaCancelada,
} from "../services/reservasMesa/correos.js";

/* ─────────── helpers ─────────── */

const actorDe = (req) => ({
  id: req.usuario.id,
  nombre: `${req.usuario.nombre || ""} ${req.usuario.apellido || ""}`.trim() || "Panel",
});

const esAdmin = (req) => !!req.usuario?.esAdmin;

const permisosDe = (req, config) => ({
  cancelar: esAdmin(req) || !!config?.permisosPersonal?.cancelar,
  forzar: esAdmin(req) || !!config?.permisosPersonal?.forzarSobrecupo,
});

const cargarConfig = (empresaId) =>
  ConfiguracionReservasMesa.findOne({ empresa: empresaId }).lean();

const responderError = (res, r) => {
  const { ok, status, codigo, mensaje, ...extra } = r;
  return res.status(status || 400).json({ code: codigo, message: mensaje, ...extra });
};

const fallo = (res, accion, error) => {
  console.error(`❌ Reservas de mesa (${accion}):`, error);
  return res.status(500).json({ message: "Ocurrió un error, intenta de nuevo" });
};

const buscarReserva = (req) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return null;
  return ReservaMesa.findOne({ _id: id, empresa: req.usuario.empresaId });
};

/** Envía correos al cliente sin hacer esperar la respuesta. */
const notificar = (fn) => {
  Promise.resolve()
    .then(fn)
    .catch((e) => console.error("❌ Notificación de reserva de mesa:", e.message));
};

/* ─────────── Configuración ─────────── */

export const obtenerConfiguracion = async (req, res) => {
  try {
    const config = await cargarConfig(req.usuario.empresaId);
    const base = config || configuracionVacia();
    return res.json({
      configuracion: base,
      faltantes: faltantesConfiguracion(config, CANAL_PANEL),
      faltantesWeb: faltantesConfiguracion(config, CANAL_WEB),
      permisos: permisosDe(req, config),
      esAdmin: esAdmin(req),
    });
  } catch (error) {
    return fallo(res, "obtener configuración", error);
  }
};

export const guardarConfiguracion = async (req, res) => {
  try {
    const empresa = req.usuario.empresaId;
    const { datos, error } = validarConfiguracion(req.body);
    if (error) return res.status(400).json({ message: error });

    const actual = await cargarConfig(empresa);

    // Un sector con reservas futuras no se puede borrar: se desactiva.
    const idsNuevos = new Set(datos.sectores.filter((s) => s._id).map((s) => String(s._id)));
    for (const s of actual?.sectores || []) {
      if (idsNuevos.has(String(s._id))) continue;
      const futuras = await ReservaMesa.countDocuments({
        empresa,
        "sector.id": s._id,
        estado: { $in: ESTADOS_QUE_OCUPAN },
        fin: { $gt: new Date() },
      });
      if (futuras > 0) {
        return res.status(409).json({
          message: `"${s.nombre}" tiene ${futuras} reserva(s) por venir. Desactívalo en vez de borrarlo.`,
        });
      }
    }
    // Un _id que no existía en la configuración no se acepta (evita mezclar sectores)
    const idsActuales = new Set((actual?.sectores || []).map((s) => String(s._id)));
    for (const s of datos.sectores) {
      if (s._id && !idsActuales.has(String(s._id))) delete s._id;
    }

    const guardada = await ConfiguracionReservasMesa.findOneAndUpdate(
      { empresa },
      { $set: { ...datos, empresa } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();

    return res.json({
      configuracion: guardada,
      faltantes: faltantesConfiguracion(guardada, CANAL_PANEL),
      faltantesWeb: faltantesConfiguracion(guardada, CANAL_WEB),
    });
  } catch (error) {
    return fallo(res, "guardar configuración", error);
  }
};

/* ─────────── Bloqueos ─────────── */

const ESTADOS_AFECTABLES = ["pendiente", "confirmada"];

/** Reservas ya tomadas que caen dentro de un bloqueo. */
const filtroAfectadas = (b) => ({
  empresa: b.empresa,
  fecha: b.fecha,
  estado: { $in: ESTADOS_AFECTABLES },
  ...(b.sector ? { "sector.id": b.sector } : {}),
  ...(b.horaDesde && b.horaHasta ? { hora: { $gte: b.horaDesde, $lt: b.horaHasta } } : {}),
});

const buscarAfectadas = async (b) => {
  const filas = await ReservaMesa.find(filtroAfectadas(b))
    .select("codigo cliente hora personas sector estado")
    .sort({ hora: 1 })
    .lean();
  // Al panel solo le sirve saber si tiene correo, no el correo en sí
  return filas.map(({ cliente, ...r }) => ({
    ...r,
    cliente: { nombre: cliente.nombre, telefono: cliente.telefono, tieneCorreo: !!cliente.email },
  }));
};

const buscarBloqueo = (req) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return null;
  return BloqueoReservaMesa.findOne({ _id: id, empresa: req.usuario.empresaId }).lean();
};

export const listarBloqueos = async (req, res) => {
  try {
    const desde = esFechaValida(req.query.desde) ? req.query.desde : hoyChile();
    const bloqueos = await BloqueoReservaMesa.find({
      empresa: req.usuario.empresaId,
      fecha: { $gte: desde },
    })
      .sort({ fecha: 1, horaDesde: 1 })
      .lean();
    // Cuántas reservas tomadas siguen dentro de cada bloqueo (para revisarlas)
    const conteos = await Promise.all(bloqueos.map((b) => ReservaMesa.countDocuments(filtroAfectadas(b))));
    return res.json(
      bloqueos.map((b, i) => ({ ...b, tipo: tipoBloqueo(b), afectadas: conteos[i] })),
    );
  } catch (error) {
    return fallo(res, "listar bloqueos", error);
  }
};

export const crearBloqueo = async (req, res) => {
  try {
    const empresa = req.usuario.empresaId;
    const { fecha, sectorId, horaDesde } = req.body;
    const motivo = limpiarTexto(req.body.motivo, 200);
    const tipo = req.body.tipo || "sin_reservas";
    // "Desde las 20:00 por orden de llegada": sin hora de término, dura hasta el cierre
    const horaHasta = tipo === "orden_llegada" && horaDesde && !req.body.horaHasta ? FIN_DEL_DIA : req.body.horaHasta;

    if (!TIPOS_BLOQUEO_MESA.includes(tipo)) return res.status(400).json({ message: "Tipo de bloqueo inválido" });
    if (!esFechaValida(fecha)) return res.status(400).json({ message: "La fecha no es válida" });
    if (fecha < hoyChile()) return res.status(400).json({ message: "No se puede bloquear un día que ya pasó" });

    const conHoras = !!(horaDesde || horaHasta);
    if (conHoras && (!esHoraValida(horaDesde) || !esHoraValida(horaHasta) || horaHasta <= horaDesde)) {
      return res.status(400).json({ message: "Revisa el tramo de horas (desde debe ser antes que hasta)" });
    }

    const config = await cargarConfig(empresa);
    let sector = null;
    if (sectorId) {
      sector = (config?.sectores || []).find((s) => String(s._id) === String(sectorId));
      if (!sector) return res.status(400).json({ message: "El sector no existe" });
    }

    const bloqueo = await BloqueoReservaMesa.create({
      empresa,
      fecha,
      sector: sector?._id || null,
      horaDesde: conHoras ? horaDesde : null,
      horaHasta: conHoras ? horaHasta : null,
      tipo,
      motivo,
      creadoPor: req.usuario.id,
    });

    // Reservas ya tomadas que caen en el bloqueo: no se tocan solas, se
    // devuelven para que el local decida (mantener, mover o cancelar avisando).
    const afectadas = await buscarAfectadas(bloqueo.toObject());
    return res.status(201).json({ bloqueo, afectadas });
  } catch (error) {
    return fallo(res, "crear bloqueo", error);
  }
};

export const afectadasDeBloqueo = async (req, res) => {
  try {
    const bloqueo = await buscarBloqueo(req);
    if (!bloqueo) return res.status(404).json({ message: "Bloqueo no encontrado" });
    return res.json({ bloqueo: { ...bloqueo, tipo: tipoBloqueo(bloqueo) }, afectadas: await buscarAfectadas(bloqueo) });
  } catch (error) {
    return fallo(res, "reservas afectadas", error);
  }
};

/**
 * Cancela las reservas elegidas de un bloqueo y avisa por correo a quienes
 * dejaron uno. Solo acepta reservas que de verdad caen en ese bloqueo.
 */
export const cancelarAfectadas = async (req, res) => {
  try {
    const bloqueo = await buscarBloqueo(req);
    if (!bloqueo) return res.status(404).json({ message: "Bloqueo no encontrado" });

    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).filter((id) => mongoose.isValidObjectId(id));
    if (ids.length === 0) return res.status(400).json({ message: "Elige al menos una reserva" });
    const mensaje = limpiarTexto(req.body.mensaje, 500);

    const reservas = await ReservaMesa.find({ ...filtroAfectadas(bloqueo), _id: { $in: ids } });
    const empresa = await Empresa.findById(req.usuario.empresaId).select("nombre slug telefono direccion").lean();
    const actor = actorDe(req);
    const detalle = `Bloqueo del ${bloqueo.fecha}${bloqueo.motivo ? ` (${bloqueo.motivo})` : ""}`;

    const canceladas = [];
    const fallidas = [];
    for (const reserva of reservas) {
      const r = await cambiarEstadoReserva({
        reserva,
        hacia: "cancelada",
        motivo: "local_no_puede_atender",
        detalle,
        por: "local",
        actor,
      });
      if (!r.ok) {
        fallidas.push({ _id: reserva._id, codigo: reserva.codigo, nombre: reserva.cliente.nombre, mensaje: r.mensaje });
        continue;
      }
      const conCorreo = !!r.reserva.cliente.email;
      if (conCorreo) notificar(() => correoReservaCancelada(r.reserva, empresa, { mensaje }));
      canceladas.push({
        _id: r.reserva._id,
        codigo: r.reserva.codigo,
        hora: r.reserva.hora,
        personas: r.reserva.personas,
        cliente: { nombre: r.reserva.cliente.nombre, telefono: r.reserva.cliente.telefono },
        correoEnviado: conCorreo,
      });
    }
    // Las que ya no estaban (se cancelaron o cambiaron de hora entretanto)
    const encontradas = new Set(reservas.map((r) => String(r._id)));
    const noEncontradas = ids.filter((id) => !encontradas.has(String(id))).length;

    return res.json({ canceladas, fallidas, noEncontradas });
  } catch (error) {
    return fallo(res, "cancelar afectadas", error);
  }
};

export const eliminarBloqueo = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Bloqueo inválido" });
    const borrado = await BloqueoReservaMesa.findOneAndDelete({ _id: id, empresa: req.usuario.empresaId });
    if (!borrado) return res.status(404).json({ message: "Bloqueo no encontrado" });
    return res.json({ message: "Bloqueo eliminado" });
  } catch (error) {
    return fallo(res, "eliminar bloqueo", error);
  }
};

/* ─────────── Disponibilidad ─────────── */

export const disponibilidad = async (req, res) => {
  try {
    const empresa = req.usuario.empresaId;
    const { fecha } = req.query;
    if (!esFechaValida(fecha)) return res.status(400).json({ message: "La fecha no es válida" });
    const personas = Math.max(1, Number(req.query.personas) || 1);

    const config = await cargarConfig(empresa);
    const faltantes = faltantesConfiguracion(config, CANAL_PANEL);
    if (faltantes.length) return res.json({ horas: [], faltantes });

    // Al editar, la propia reserva no cuenta contra sí misma
    let descontar = null;
    if (req.query.excluir && mongoose.isValidObjectId(req.query.excluir)) {
      const r = await ReservaMesa.findOne({ _id: req.query.excluir, empresa }).lean();
      if (r?.ocupaCupo) descontar = { sectorId: r.sector.id, franjas: r.franjas, personas: r.personas };
    }

    const horas = await disponibilidadDelDia({ empresaId: empresa, config, fecha, personas, descontar });
    return res.json({ horas, faltantes: [] });
  } catch (error) {
    return fallo(res, "disponibilidad", error);
  }
};

/* ─────────── Vista del día ─────────── */

export const reservasDelDia = async (req, res) => {
  try {
    const empresa = req.usuario.empresaId;
    const { fecha } = req.params;
    if (!esFechaValida(fecha)) return res.status(400).json({ message: "La fecha no es válida" });

    const [config, reservas] = await Promise.all([
      cargarConfig(empresa),
      ReservaMesa.find({ empresa, fecha }).sort({ inicio: 1, createdAt: 1 }).lean(),
    ]);

    const ahora = new Date();
    const tolerancia = config?.toleranciaMinutos ?? 0;
    const activas = reservas.filter((r) => r.estado !== "cancelada");
    const suma = (lista) => lista.reduce((t, r) => t + r.personas, 0);

    const resumen = {
      reservas: activas.length,
      personasEsperadas: suma(activas.filter((r) => ["pendiente", "confirmada", "llego", "completada"].includes(r.estado))),
      personasLlegaron: suma(activas.filter((r) => ["llego", "completada"].includes(r.estado))),
      porConfirmar: activas.filter((r) => r.estado === "pendiente").length,
      noAsistio: activas.filter((r) => r.estado === "no_asistio").length,
      cumpleanos: activas.filter((r) => r.cumpleanos?.es && r.estado !== "no_asistio").length,
      canceladas: reservas.length - activas.length,
      // Ocupación en este momento (solo tiene sentido hoy)
      ocupacionAhora:
        fecha === hoyChile()
          ? (config?.sectores || [])
              .filter((s) => s.activo)
              .map((s) => ({
                id: String(s._id),
                nombre: s.nombre,
                capacidad: s.capacidad,
                personas: suma(
                  activas.filter(
                    (r) =>
                      String(r.sector.id) === String(s._id) &&
                      r.ocupaCupo &&
                      new Date(r.inicio) <= ahora &&
                      new Date(r.fin) > ahora,
                  ),
                ),
              }))
          : [],
    };

    const lista = reservas.map((r) => ({
      ...reservaParaPanel(r),
      historial: undefined,
      atrasada:
        r.estado === "confirmada" &&
        new Date(r.inicio).getTime() + tolerancia * 60000 < ahora.getTime(),
    }));

    return res.json({ fecha, reservas: lista, resumen, toleranciaMinutos: tolerancia });
  } catch (error) {
    return fallo(res, "reservas del día", error);
  }
};

/* ─────────── Agenda (resumen por día de un rango) ─────────── */

export const calendario = async (req, res) => {
  try {
    const empresa = req.usuario.empresaId;
    const { desde, hasta } = req.query;
    if (!esFechaValida(desde) || !esFechaValida(hasta) || hasta < desde || hasta > sumarDias(desde, 62)) {
      return res.status(400).json({ message: "Rango de fechas inválido (máximo 62 días)" });
    }
    const empresaId = new mongoose.Types.ObjectId(String(empresa));
    const [filas, bloqueos] = await Promise.all([
      ReservaMesa.aggregate([
        { $match: { empresa: empresaId, fecha: { $gte: desde, $lte: hasta }, estado: { $ne: "cancelada" } } },
        {
          $group: {
            _id: "$fecha",
            reservas: { $sum: 1 },
            personas: { $sum: "$personas" },
            pendientes: { $sum: { $cond: [{ $eq: ["$estado", "pendiente"] }, 1, 0] } },
            cumpleanos: { $sum: { $cond: ["$cumpleanos.es", 1, 0] } },
          },
        },
      ]),
      BloqueoReservaMesa.find({ empresa, fecha: { $gte: desde, $lte: hasta } })
        .select("fecha sector horaDesde horaHasta motivo tipo")
        .lean(),
    ]);
    return res.json({
      dias: filas.map((f) => ({
        fecha: f._id,
        reservas: f.reservas,
        personas: f.personas,
        pendientes: f.pendientes,
        cumpleanos: f.cumpleanos,
      })),
      bloqueos: bloqueos.map((b) => ({ ...b, tipo: tipoBloqueo(b) })),
    });
  } catch (error) {
    return fallo(res, "calendario", error);
  }
};

/* ─────────── Listado con filtros ─────────── */

export const listarReservas = async (req, res) => {
  try {
    const empresa = req.usuario.empresaId;
    const { desde, hasta, estado, sector, origen, cumpleanos, q } = req.query;
    const pagina = Math.max(1, Number(req.query.pagina) || 1);
    const porPagina = Math.min(100, Math.max(1, Number(req.query.porPagina) || 25));

    const filtro = { empresa };
    if (esFechaValida(desde) || esFechaValida(hasta)) {
      filtro.fecha = {};
      if (esFechaValida(desde)) filtro.fecha.$gte = desde;
      if (esFechaValida(hasta)) filtro.fecha.$lte = hasta;
    }
    if (estado) {
      const estados = String(estado).split(",").filter((e) => ESTADOS_RESERVA_MESA.includes(e));
      if (estados.length) filtro.estado = { $in: estados };
    }
    if (sector && mongoose.isValidObjectId(sector)) filtro["sector.id"] = sector;
    if (origen && ORIGENES_RESERVA_MESA.includes(origen)) filtro.origen = origen;
    if (cumpleanos === "si") filtro["cumpleanos.es"] = true;

    const texto = limpiarTexto(q, 60);
    if (texto) {
      const tel = normalizarTelefono(texto);
      const ors = [
        { "cliente.nombre": new RegExp(escaparRegex(texto), "i") },
        { codigo: texto.toUpperCase() },
      ];
      if (tel.length >= 4) ors.push({ "cliente.telefonoNormalizado": new RegExp(escaparRegex(tel)) });
      filtro.$or = ors;
    }

    const orden = req.query.orden === "desc" ? -1 : 1;
    const [items, total] = await Promise.all([
      ReservaMesa.find(filtro)
        .sort({ inicio: orden })
        .skip((pagina - 1) * porPagina)
        .limit(porPagina)
        .select("-historial -franjas -tokensCancelacion -claveIdempotencia")
        .lean(),
      ReservaMesa.countDocuments(filtro),
    ]);

    return res.json({ items, total, pagina, porPagina, paginas: Math.ceil(total / porPagina) });
  } catch (error) {
    return fallo(res, "listar reservas", error);
  }
};

/* ─────────── Crear / ver / editar / estado ─────────── */

export const crear = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const config = await cargarConfig(empresaId);
    const permisos = permisosDe(req, config);

    const r = await crearReserva({
      empresaId,
      config,
      entrada: req.body,
      canal: CANAL_PANEL,
      actor: actorDe(req),
      puedeForzar: permisos.forzar,
    });
    if (!r.ok) return responderError(res, r);

    if (!r.repetida && r.reserva.cliente.email) {
      const empresa = await Empresa.findById(empresaId).select("nombre slug telefono direccion").lean();
      notificar(() => correoReservaCliente(r.reserva, empresa, { token: r.tokenCancelacion, config }));
    }
    return res.status(r.repetida ? 200 : 201).json(reservaParaPanel(r.reserva));
  } catch (error) {
    return fallo(res, "crear reserva", error);
  }
};

export const obtener = async (req, res) => {
  try {
    const reserva = await buscarReserva(req);
    if (!reserva) return res.status(404).json({ message: "Reserva no encontrada" });
    return res.json(reservaParaPanel(reserva));
  } catch (error) {
    return fallo(res, "obtener reserva", error);
  }
};

export const editar = async (req, res) => {
  try {
    const reserva = await buscarReserva(req);
    if (!reserva) return res.status(404).json({ message: "Reserva no encontrada" });

    const config = await cargarConfig(req.usuario.empresaId);
    const r = await editarReserva({
      empresaId: req.usuario.empresaId,
      config,
      reserva,
      entrada: req.body,
      actor: actorDe(req),
      puedeForzar: permisosDe(req, config).forzar,
    });
    if (!r.ok) return responderError(res, r);
    return res.json(reservaParaPanel(r.reserva));
  } catch (error) {
    return fallo(res, "editar reserva", error);
  }
};

export const cambiarEstado = async (req, res) => {
  try {
    const reserva = await buscarReserva(req);
    if (!reserva) return res.status(404).json({ message: "Reserva no encontrada" });

    const config = await cargarConfig(req.usuario.empresaId);
    const { estado, motivo, detalle, por } = req.body;
    const r = await cambiarEstadoReserva({
      reserva,
      hacia: estado,
      motivo,
      detalle,
      por: por === "cliente" ? "cliente" : "local",
      actor: actorDe(req),
      puedeCancelar: permisosDe(req, config).cancelar,
    });
    if (!r.ok) return responderError(res, r);

    // Correos al cliente: al confirmar una pendiente y al cancelar
    if (reserva.cliente.email && (estado === "confirmada" || estado === "cancelada")) {
      const empresa = await Empresa.findById(req.usuario.empresaId).select("nombre slug telefono direccion").lean();
      notificar(() =>
        estado === "confirmada"
          ? correoReservaCliente(r.reserva, empresa, { config })
          : correoReservaCancelada(r.reserva, empresa),
      );
    }
    return res.json(reservaParaPanel(r.reserva));
  } catch (error) {
    return fallo(res, "cambiar estado", error);
  }
};

/* ─────────── Indicadores simples de un rango ─────────── */

export const resumen = async (req, res) => {
  try {
    const empresa = req.usuario.empresaId;
    const { desde, hasta } = req.query;
    if (!esFechaValida(desde) || !esFechaValida(hasta) || hasta < desde) {
      return res.status(400).json({ message: "Rango de fechas inválido" });
    }

    const filas = await ReservaMesa.aggregate([
      { $match: { empresa: new mongoose.Types.ObjectId(String(empresa)), fecha: { $gte: desde, $lte: hasta } } },
      {
        $group: {
          _id: { fecha: "$fecha", estado: "$estado" },
          reservas: { $sum: 1 },
          personas: { $sum: "$personas" },
          cumpleanos: { $sum: { $cond: ["$cumpleanos.es", 1, 0] } },
        },
      },
    ]);
    const porMotivo = await ReservaMesa.aggregate([
      {
        $match: {
          empresa: new mongoose.Types.ObjectId(String(empresa)),
          fecha: { $gte: desde, $lte: hasta },
          estado: "cancelada",
        },
      },
      { $group: { _id: "$cancelacion.motivo", reservas: { $sum: 1 } } },
    ]);
    const porOrigen = await ReservaMesa.aggregate([
      { $match: { empresa: new mongoose.Types.ObjectId(String(empresa)), fecha: { $gte: desde, $lte: hasta } } },
      { $group: { _id: "$origen", reservas: { $sum: 1 } } },
    ]);

    return res.json({
      porDiaYEstado: filas.map((f) => ({ fecha: f._id.fecha, estado: f._id.estado, reservas: f.reservas, personas: f.personas, cumpleanos: f.cumpleanos })),
      cancelacionesPorMotivo: porMotivo.map((m) => ({ motivo: m._id, reservas: m.reservas })),
      porOrigen: porOrigen.map((o) => ({ origen: o._id, reservas: o.reservas })),
    });
  } catch (error) {
    return fallo(res, "resumen", error);
  }
};
