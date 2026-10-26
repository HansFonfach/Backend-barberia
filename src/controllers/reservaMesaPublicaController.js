// Página pública de reservas de mesa (sin cuenta). Solo expone lo que el
// cliente necesita: horas disponibles (sin cupos ni datos de otras
// reservas), crear su reserva y cancelarla con su link.
import Empresa from "../models/empresa.model.js";
import ConfiguracionReservasMesa from "../models/configuracionReservasMesa.model.js";
import ReservaMesa from "../models/reservaMesa.model.js";
import BloqueoReservaMesa from "../models/bloqueoReservaMesa.model.js";
import {
  faltantesConfiguracion,
  horasDeLlegada,
  diasEspecialesPublicos,
  CANAL_WEB,
} from "../services/reservasMesa/reglas.js";
import { disponibilidadDelDia } from "../services/reservasMesa/disponibilidad.js";
import { crearReserva, cambiarEstadoReserva } from "../services/reservasMesa/reservas.js";
import { esFechaValida, hoyChile, sumarDias } from "../services/reservasMesa/tiempo.js";
import { hashToken } from "../services/reservasMesa/utilidades.js";
import {
  correoReservaCliente,
  correoAvisoLocal,
  correoReservaCancelada,
} from "../services/reservasMesa/correos.js";

const CAMPOS_EMPRESA = "nombre slug telefono direccion correo logo estado estadoSuscripcion modulos";

/** Empresa pública con el módulo activo, o null. */
const empresaPublica = async (slug) => {
  const empresa = await Empresa.findOne({ slug: String(slug || "").toLowerCase() })
    .select(CAMPOS_EMPRESA)
    .lean();
  if (!empresa || empresa.estado === "inactivo") return null;
  if (["suspendido", "cancelado"].includes(empresa.estadoSuscripcion)) return null;
  if (!empresa.modulos?.reservasMesas) return null;
  return empresa;
};

const noDisponible = (res) =>
  res.status(404).json({ message: "Este local no tiene reservas en línea disponibles" });

const fallo = (res, accion, error) => {
  console.error(`❌ Reservas de mesa públicas (${accion}):`, error);
  return res.status(500).json({ message: "Ocurrió un error, intenta de nuevo" });
};

/** Días especiales (sin reservas / solo por orden de llegada) de un rango. */
const diasEspeciales = async (empresaId, desde, hasta) =>
  diasEspecialesPublicos(
    await BloqueoReservaMesa.find({ empresa: empresaId, sector: null, fecha: { $gte: desde, $lte: hasta } })
      .select("fecha sector horaDesde horaHasta motivo tipo")
      .lean(),
  );

const notificar = (fn) => {
  Promise.resolve()
    .then(fn)
    .catch((e) => console.error("❌ Notificación de reserva de mesa:", e.message));
};

/* ─────────── Información para armar el formulario ─────────── */

export const info = async (req, res) => {
  try {
    const empresa = await empresaPublica(req.params.slug);
    if (!empresa) return noDisponible(res);

    const config = await ConfiguracionReservasMesa.findOne({ empresa: empresa._id }).lean();
    const activa = faltantesConfiguracion(config, CANAL_WEB).length === 0;
    const hoy = hoyChile();
    const hasta = activa ? sumarDias(hoy, config.anticipacionMaximaDias) : null;

    return res.json({
      empresa: {
        nombre: empresa.nombre,
        telefono: empresa.telefono || "",
        direccion: empresa.direccion || "",
        logo: empresa.logo || null,
      },
      activa,
      ...(activa
        ? {
            sectores: config.sectores
              .filter((s) => s.activo && s.reservableOnline)
              .map((s) => ({ id: String(s._id), nombre: s.nombre })),
            maxPersonas: config.maxPersonasWeb,
            hoy,
            hasta,
            diasEspeciales: await diasEspeciales(empresa._id, hoy, hasta),
            diasAbiertos: config.horario.filter((d) => d.abierto).map((d) => d.dia),
            toleranciaMinutos: config.toleranciaMinutos,
            mensajePublico: config.mensajePublico,
            mensajeCumpleanos: config.mensajeCumpleanos,
            confirmacionAutomatica: config.confirmacionAutomaticaWeb,
            mostrarCupos: !!config.mostrarCuposWeb,
            cancelacion: config.cancelacionWeb,
          }
        : {}),
    });
  } catch (error) {
    return fallo(res, "info", error);
  }
};

/* ─────────── Horas disponibles de un día ─────────── */

export const disponibilidadPublica = async (req, res) => {
  try {
    const empresa = await empresaPublica(req.params.slug);
    if (!empresa) return noDisponible(res);

    const { fecha } = req.query;
    const personas = Number(req.query.personas);
    if (!esFechaValida(fecha) || !Number.isInteger(personas) || personas < 1) {
      return res.status(400).json({ message: "Indica fecha y cantidad de personas" });
    }

    const config = await ConfiguracionReservasMesa.findOne({ empresa: empresa._id }).lean();
    if (faltantesConfiguracion(config, CANAL_WEB).length) return noDisponible(res);
    if (personas > config.maxPersonasWeb) {
      return res.json({ horas: [], grupoGrande: true, maxPersonas: config.maxPersonasWeb });
    }
    if (fecha < hoyChile() || fecha > sumarDias(hoyChile(), config.anticipacionMaximaDias)) {
      return res.json({ horas: [], fueraDeRango: true });
    }

    // Día completo sin reservas o solo por orden de llegada: se dice claro,
    // en vez de mostrar "no quedan horas".
    const especiales = await diasEspeciales(empresa._id, fecha, fecha);
    const diaEspecial = especiales.find((d) => d.diaCompleto) || null;
    if (diaEspecial) return res.json({ cerrado: false, horas: [], diaEspecial });
    // Tramos por orden de llegada (por ejemplo, desde las 20:00): se avisan
    const avisos = especiales.filter((d) => d.tipo === "orden_llegada").map((d) => d.mensaje);

    const horas = await disponibilidadDelDia({
      empresaId: empresa._id,
      config,
      fecha,
      personas,
      canal: CANAL_WEB,
    });

    // Al público se le dice si hay lugar; cuántos lugares quedan, solo si el
    // local lo activó en la configuración.
    const conCupos = !!config.mostrarCuposWeb;
    return res.json({
      cerrado: horasDeLlegada(config, fecha).length === 0,
      avisos,
      horas: horas
        .map((h) => ({
          hora: h.hora,
          sectores: h.sectores
            .filter((s) => s.disponible)
            .map((s) => ({ id: s.id, nombre: s.nombre, disponible: true, ...(conCupos ? { libre: s.libre } : {}) })),
        }))
        .filter((h) => h.sectores.length > 0),
    });
  } catch (error) {
    return fallo(res, "disponibilidad", error);
  }
};

/* ─────────── Reservar ─────────── */

export const reservarPublico = async (req, res) => {
  try {
    // Campo trampa: los humanos no lo ven; los bots lo llenan
    if (req.body?.sitioWeb) return res.status(400).json({ message: "No se pudo procesar la solicitud" });

    const empresa = await empresaPublica(req.params.slug);
    if (!empresa) return noDisponible(res);

    const config = await ConfiguracionReservasMesa.findOne({ empresa: empresa._id }).lean();
    const r = await crearReserva({
      empresaId: empresa._id,
      config,
      entrada: {
        nombre: req.body.nombre,
        telefono: req.body.telefono,
        email: req.body.email,
        fecha: req.body.fecha,
        hora: req.body.hora,
        personas: req.body.personas,
        sectorId: req.body.sectorId,
        cumpleanos: req.body.cumpleanos,
        comentarios: req.body.comentarios,
        claveIdempotencia: req.body.claveIdempotencia,
      },
      canal: CANAL_WEB,
      actor: null,
    });

    if (!r.ok) {
      const { ok, status, codigo, mensaje, alternativas } = r;
      return res.status(status).json({
        code: codigo,
        message: mensaje,
        // Las alternativas públicas solo traen hora y sector
        alternativas: (alternativas || []).map((a) => ({ hora: a.hora, sectorId: a.sectorId, sector: a.sector })),
      });
    }

    const reserva = r.reserva;
    if (!r.repetida) {
      notificar(() => correoReservaCliente(reserva, empresa, { token: r.tokenCancelacion, config }));
      notificar(() => correoAvisoLocal(reserva, empresa));
    }

    return res.status(r.repetida ? 200 : 201).json({
      codigo: reserva.codigo,
      estado: reserva.estado,
      fecha: reserva.fecha,
      hora: reserva.hora,
      personas: reserva.personas,
      sector: reserva.sector.nombre,
      nombre: reserva.cliente.nombre,
      email: reserva.cliente.email,
    });
  } catch (error) {
    return fallo(res, "reservar", error);
  }
};

/* ─────────── Cancelar con el link del correo ─────────── */

const buscarPorToken = async (token) => {
  if (!token || typeof token !== "string" || token.length < 32) return null;
  return ReservaMesa.findOne({ tokensCancelacion: hashToken(token) });
};

const puedeCancelarCliente = (reserva, config, ahora = new Date()) => {
  if (!config?.cancelacionWeb?.permitida) {
    return { ok: false, motivo: "El local no permite cancelar en línea. Llámanos para cancelar." };
  }
  if (!["pendiente", "confirmada"].includes(reserva.estado)) {
    return { ok: false, motivo: "Esta reserva ya no se puede cancelar." };
  }
  const limite = new Date(reserva.inicio).getTime() - config.cancelacionWeb.horasLimite * 3600000;
  if (ahora.getTime() > limite) {
    return {
      ok: false,
      motivo: `Solo se puede cancelar en línea hasta ${config.cancelacionWeb.horasLimite} hora(s) antes. Llámanos para cancelar.`,
    };
  }
  return { ok: true };
};

export const infoCancelacion = async (req, res) => {
  try {
    const reserva = await buscarPorToken(req.params.token);
    if (!reserva) return res.status(404).json({ message: "El link no es válido o ya no está vigente" });

    const [empresa, config] = await Promise.all([
      Empresa.findById(reserva.empresa).select("nombre slug telefono").lean(),
      ConfiguracionReservasMesa.findOne({ empresa: reserva.empresa }).lean(),
    ]);
    const permitido = puedeCancelarCliente(reserva, config);

    return res.json({
      empresa: { nombre: empresa?.nombre, slug: empresa?.slug, telefono: empresa?.telefono || "" },
      reserva: {
        codigo: reserva.codigo,
        nombre: reserva.cliente.nombre,
        fecha: reserva.fecha,
        hora: reserva.hora,
        personas: reserva.personas,
        sector: reserva.sector.nombre,
        estado: reserva.estado,
      },
      puedeCancelar: permitido.ok,
      motivo: permitido.motivo || "",
    });
  } catch (error) {
    return fallo(res, "info cancelación", error);
  }
};

export const cancelarPublico = async (req, res) => {
  try {
    const reserva = await buscarPorToken(req.body?.token);
    if (!reserva) return res.status(404).json({ message: "El link no es válido o ya no está vigente" });

    const [empresa, config] = await Promise.all([
      Empresa.findById(reserva.empresa).select("nombre slug telefono direccion").lean(),
      ConfiguracionReservasMesa.findOne({ empresa: reserva.empresa }).lean(),
    ]);
    const permitido = puedeCancelarCliente(reserva, config);
    if (!permitido.ok) return res.status(409).json({ message: permitido.motivo });

    const r = await cambiarEstadoReserva({
      reserva,
      hacia: "cancelada",
      motivo: "cliente_cancelo",
      detalle: "Cancelada por el cliente desde el link del correo",
      por: "cliente",
      actor: { id: null, nombre: "cliente (link)" },
    });
    if (!r.ok) return res.status(r.status).json({ message: r.mensaje });

    notificar(() => correoReservaCancelada(r.reserva, empresa));
    return res.json({ message: "Tu reserva fue cancelada", estado: r.reserva.estado });
  } catch (error) {
    return fallo(res, "cancelar", error);
  }
};
