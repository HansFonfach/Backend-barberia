// Página pública de reserva de cancha (sin cuenta). Solo expone lo que el
// cliente necesita: qué horas y mitades están libres (nunca quién reservó),
// crear su reserva y cancelarla con su link.
import Empresa from "../models/empresa.model.js";
import ReservaCancha from "../models/reservaCancha.model.js";
import { esFechaValida, hoyChile, sumarDias } from "../services/reservasMesa/tiempo.js";
import { hashToken, entradaHistorial, limpiarTexto } from "../services/reservasMesa/utilidades.js";
import { buscarClienteBloqueado, respuestaBloqueo } from "../utils/bloqueoCliente.js";
import { puedeCancelarWeb } from "../services/canchas/reglas.js";
import {
  ErrorCancha,
  obtenerConfig,
  reservasActivasEnRango,
  disponibilidad,
  crearReservaCancha,
} from "../services/canchas/reservas.js";
import {
  correoReservaCliente,
  correoAvisoLocal,
  correoReservaCancelada,
  whatsappAvisoLocal,
} from "../services/canchas/notificaciones.js";
import { anotarEnEspera, revisarEnSegundoPlano } from "../services/canchas/listaEspera.js";

const CAMPOS_EMPRESA = "nombre slug telefono direccion ciudad redes correo logo estado estadoSuscripcion modulos notificacionReservaCorreo";

/** Empresa pública con el módulo de canchas activo, o null. */
const empresaPublica = async (slug) => {
  const empresa = await Empresa.findOne({ slug: String(slug || "").toLowerCase() })
    .select(CAMPOS_EMPRESA)
    .lean();
  if (!empresa || empresa.estado === "inactivo") return null;
  if (["suspendido", "cancelado"].includes(empresa.estadoSuscripcion)) return null;
  if (!empresa.modulos?.canchas) return null;
  return empresa;
};

const noDisponible = (res) => res.status(404).json({ message: "Este recinto no tiene reservas en línea disponibles" });

const fallo = (res, accion, error) => {
  if (error instanceof ErrorCancha) return res.status(error.status).json({ message: error.message, ...error.extra });
  console.error(`❌ Canchas públicas (${accion}):`, error);
  return res.status(500).json({ message: "Ocurrió un error, intenta de nuevo" });
};

const notificar = (fn) => {
  Promise.resolve()
    .then(fn)
    .catch((e) => console.error("❌ Notificación de cancha:", e.message));
};

/** Lo que la página pública puede mostrar de la configuración. */
const configPublica = (config) => ({
  nombreCancha: config.nombreCancha,
  superficie: config.superficie,
  jugadoresCompleta: config.jugadoresCompleta,
  jugadoresMedia: config.jugadoresMedia,
  permiteMedia: config.permiteMedia,
  horario: config.horario,
  precios: config.precios,
  abono: { activo: !!config.abono?.activo, porcentaje: config.abono?.porcentaje || 0 },
  reglas: config.reglas || [],
  mensajePublico: config.mensajePublico || "",
  anticipacion: config.anticipacion,
  cancelacion: config.cancelacion,
});

/* ─────────── Información de la página ─────────── */

export const info = async (req, res) => {
  try {
    const empresa = await empresaPublica(req.params.slug);
    if (!empresa) return noDisponible(res);
    const config = await obtenerConfig(empresa._id);
    return res.json({
      empresa: {
        nombre: empresa.nombre,
        slug: empresa.slug,
        telefono: empresa.telefono || "",
        direccion: empresa.direccion || "",
        ciudad: empresa.ciudad || "",
        logo: empresa.logo || null,
        instagram: empresa.redes?.instagram || "",
      },
      config: configPublica(config),
      hoy: hoyChile(),
    });
  } catch (error) {
    return fallo(res, "info", error);
  }
};

/* ─────────── Disponibilidad (hasta 14 días) ─────────── */

export const disponibilidadPublica = async (req, res) => {
  try {
    const empresa = await empresaPublica(req.params.slug);
    if (!empresa) return noDisponible(res);
    const config = await obtenerConfig(empresa._id);

    const hoy = hoyChile();
    let desde = esFechaValida(req.query.desde) ? req.query.desde : hoy;
    if (desde < hoy) desde = hoy;
    const dias = Math.min(14, Math.max(1, parseInt(req.query.dias, 10) || 7));
    const maxFecha = sumarDias(hoy, config.anticipacion?.diasMaximo || 30);
    if (desde > maxFecha) return res.json({ dias: [], maxFecha });

    const hasta = sumarDias(desde, dias - 1);
    const reservas = await reservasActivasEnRango(empresa._id, desde, hasta);
    return res.json({ dias: disponibilidad(config, reservas, desde, dias), maxFecha });
  } catch (error) {
    return fallo(res, "disponibilidad", error);
  }
};

/* ─────────── Reservar ─────────── */

export const reservarPublico = async (req, res) => {
  try {
    const empresa = await empresaPublica(req.params.slug);
    if (!empresa) return noDisponible(res);

    // Campo trampa para bots: una persona nunca lo llena
    if (limpiarTexto(req.body?.sitio, 100)) return res.status(400).json({ message: "No se pudo crear la reserva" });

    const bloqueado = await buscarClienteBloqueado(empresa._id, {
      email: req.body?.email,
      telefono: req.body?.telefono,
    });
    if (bloqueado) return res.status(403).json(respuestaBloqueo);

    const config = await obtenerConfig(empresa._id);
    const { reserva, token } = await crearReservaCancha(empresa, config, req.body || {});

    notificar(() => correoReservaCliente(reserva, empresa, { token, config }));
    // El aviso por correo al recinto se puede apagar en Configuración → Notificaciones
    if (empresa.notificacionReservaCorreo !== false) notificar(() => correoAvisoLocal(reserva, empresa));
    if (config.telefonosAviso?.length) notificar(() => whatsappAvisoLocal(reserva, empresa, config.telefonosAviso));

    return res.status(201).json({
      reserva: {
        codigo: reserva.codigo,
        fecha: reserva.fecha,
        hora: reserva.hora,
        tipo: reserva.tipo,
        lados: reserva.lados,
        estado: reserva.estado,
        precio: reserva.precio,
        abono: reserva.abono,
      },
      abono: config.abono?.activo ? { porcentaje: config.abono.porcentaje, instrucciones: config.abono.instrucciones || "" } : null,
    });
  } catch (error) {
    return fallo(res, "reservar", error);
  }
};

/* ─────────── Lista de espera: "avísame si se libera" ─────────── */

export const anotarListaEspera = async (req, res) => {
  try {
    const empresa = await empresaPublica(req.params.slug);
    if (!empresa) return noDisponible(res);
    if (limpiarTexto(req.body?.sitio, 100)) return res.status(400).json({ message: "No se pudo anotar" });

    const bloqueado = await buscarClienteBloqueado(empresa._id, { email: req.body?.email, telefono: req.body?.telefono });
    if (bloqueado) return res.status(403).json(respuestaBloqueo);

    const config = await obtenerConfig(empresa._id);
    const { entrada, posicion } = await anotarEnEspera(empresa, config, req.body || {});
    return res.status(201).json({ ok: true, fecha: entrada.fecha, hora: entrada.hora, tipo: entrada.tipo, posicion });
  } catch (error) {
    return fallo(res, "lista de espera", error);
  }
};

/* ─────────── Cancelar con el link del correo ─────────── */

const reservaPorToken = (token) =>
  token && /^[a-f0-9]{64}$/.test(String(token))
    ? ReservaCancha.findOne({ tokenCancelacionHash: hashToken(token) })
    : null;

export const infoCancelacion = async (req, res) => {
  try {
    const reserva = await reservaPorToken(req.params.token);
    if (!reserva) return res.status(404).json({ message: "El link no es válido o la reserva ya no existe" });
    const empresa = await Empresa.findById(reserva.empresa).select("nombre slug telefono logo").lean();
    const config = await obtenerConfig(reserva.empresa);
    const puede = puedeCancelarWeb(config, reserva);
    return res.json({
      empresa: { nombre: empresa?.nombre || "", slug: empresa?.slug || "", telefono: empresa?.telefono || "", logo: empresa?.logo || null },
      reserva: {
        codigo: reserva.codigo,
        fecha: reserva.fecha,
        hora: reserva.hora,
        tipo: reserva.tipo,
        lados: reserva.lados,
        estado: reserva.estado,
        nombre: reserva.cliente.nombre,
      },
      puedeCancelar: puede.ok,
      mensaje: puede.mensaje || "",
    });
  } catch (error) {
    return fallo(res, "info cancelación", error);
  }
};

export const cancelarPublico = async (req, res) => {
  try {
    const reserva = await reservaPorToken(req.body?.token);
    if (!reserva) return res.status(404).json({ message: "El link no es válido o la reserva ya no existe" });
    const config = await obtenerConfig(reserva.empresa);
    const puede = puedeCancelarWeb(config, reserva);
    if (!puede.ok) return res.status(400).json({ message: puede.mensaje });

    const actualizada = await ReservaCancha.findOneAndUpdate(
      { _id: reserva._id, estado: { $in: ["pendiente", "confirmada"] } },
      {
        $set: {
          estado: "cancelada",
          activa: false,
          cancelacion: { fecha: new Date(), por: "cliente", motivo: limpiarTexto(req.body?.motivo, 200) },
        },
        $push: { historial: entradaHistorial(null, "cancelada", { detalle: "Cancelada por el cliente desde el link" }) },
      },
      { new: true },
    ).lean();
    if (!actualizada) return res.status(409).json({ message: "Esta reserva ya no se puede cancelar" });

    const empresa = await Empresa.findById(reserva.empresa).select(CAMPOS_EMPRESA).lean();
    notificar(() => correoReservaCancelada(actualizada, empresa));
    // Se liberó: avisar a la lista de espera de esa hora
    revisarEnSegundoPlano(reserva.empresa, [{ fecha: actualizada.fecha, hora: actualizada.hora }]);
    return res.json({ ok: true });
  } catch (error) {
    return fallo(res, "cancelar", error);
  }
};
