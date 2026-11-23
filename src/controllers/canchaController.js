// Panel del módulo de canchas: configuración, agenda semanal, reservas
// (incluida la reserva fija semanal), estados, pagos y resumen del mes.
// La empresa sale siempre del token (req.usuario.empresaId), nunca del body.
import crypto from "crypto";
import mongoose from "mongoose";
import Empresa from "../models/empresa.model.js";
import ConfiguracionCancha from "../models/configuracionCancha.model.js";
import ReservaCancha from "../models/reservaCancha.model.js";
import { esFechaValida, hoyChile, sumarDias, diaSemana } from "../services/reservasMesa/tiempo.js";
import { entradaHistorial, limpiarTexto, escaparRegex, esTelefonoValido } from "../services/reservasMesa/utilidades.js";
import { RE_HORA_EN_PUNTO, puedeTransicionar, resumenDelMes, ESTADOS_ARRIENDO } from "../services/canchas/reglas.js";
import {
  ErrorCancha,
  obtenerConfig,
  reservasActivasEnRango,
  disponibilidad,
  crearReservaCancha,
} from "../services/canchas/reservas.js";
import {
  correoReservaCliente,
  correoReservaConfirmada,
  correoReservaCancelada,
} from "../services/canchas/notificaciones.js";
import { esperandoEnRango, revisarEnSegundoPlano } from "../services/canchas/listaEspera.js";

const CAMPOS_EMPRESA = "nombre slug telefono direccion ciudad redes correo logo";
const MAX_SEMANAS_SERIE = 16;
const ESTADOS = ["pendiente", "confirmada", "completada", "no_asistio", "cancelada"];

const actorDe = (req) => ({
  id: req.usuario.id,
  nombre: `${req.usuario.nombre || ""} ${req.usuario.apellido || ""}`.trim() || "Panel",
});

const fallo = (res, accion, error) => {
  if (error instanceof ErrorCancha) return res.status(error.status).json({ message: error.message, ...error.extra });
  if (error?.name === "ValidationError") return res.status(400).json({ message: "Hay datos inválidos en la configuración" });
  console.error(`❌ Canchas (${accion}):`, error);
  return res.status(500).json({ message: "Ocurrió un error, intenta de nuevo" });
};

const notificar = (fn) => {
  Promise.resolve()
    .then(fn)
    .catch((e) => console.error("❌ Notificación de cancha:", e.message));
};

const empresaDe = (req) => Empresa.findById(req.usuario.empresaId).select(CAMPOS_EMPRESA).lean();
const mesValido = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ""));
const finDeMes = (mes) => {
  const [a, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;
};
const mesAnterior = (mes) => {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
};
const entero = (v, min, max, defecto) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defecto;
};

/* ─────────── Configuración ─────────── */

export const obtenerConfiguracion = async (req, res) => {
  try {
    const [config, empresa] = await Promise.all([obtenerConfig(req.usuario.empresaId), empresaDe(req)]);
    return res.json({ config, empresa });
  } catch (error) {
    return fallo(res, "configuración", error);
  }
};

/** Arma la configuración a guardar solo con campos conocidos y validados. */
const configDesdeBody = (b, actual) => {
  const c = {};
  if (b.nombreCancha !== undefined) c.nombreCancha = limpiarTexto(b.nombreCancha, 60) || "Cancha principal";
  if (b.superficie !== undefined) c.superficie = limpiarTexto(b.superficie, 60);
  if (b.jugadoresCompleta !== undefined) c.jugadoresCompleta = limpiarTexto(b.jugadoresCompleta, 30);
  if (b.jugadoresMedia !== undefined) c.jugadoresMedia = limpiarTexto(b.jugadoresMedia, 30);
  if (b.permiteMedia !== undefined) c.permiteMedia = !!b.permiteMedia;

  if (Array.isArray(b.horario)) {
    c.horario = [0, 1, 2, 3, 4, 5, 6].map((dia) => {
      const h = b.horario.find((x) => Number(x?.dia) === dia) || actual.horario?.find((x) => x.dia === dia) || {};
      const desde = RE_HORA_EN_PUNTO.test(h.desde) ? h.desde : "19:00";
      const hasta = RE_HORA_EN_PUNTO.test(h.hasta) ? h.hasta : "22:00";
      if (h.activo && hasta < desde) throw new ErrorCancha(400, "En el horario, la última hora no puede ser antes que la primera");
      return { dia, activo: !!h.activo, desde, hasta };
    });
  }

  if (Array.isArray(b.diasCerrados)) {
    const vistos = new Set();
    c.diasCerrados = b.diasCerrados
      .filter((d) => esFechaValida(d?.fecha) && !vistos.has(d.fecha) && vistos.add(d.fecha))
      .map((d) => ({ fecha: d.fecha, motivo: limpiarTexto(d.motivo, 120) }))
      .filter((d) => d.fecha >= sumarDias(hoyChile(), -60)) // se limpian los muy antiguos
      .sort((x, y) => x.fecha.localeCompare(y.fecha))
      .slice(0, 100);
  }

  if (b.precios) {
    c.precios = {
      completa: entero(b.precios.completa, 0, 10000000, actual.precios?.completa ?? 70000),
      media: entero(b.precios.media, 0, 10000000, actual.precios?.media ?? 35000),
    };
  }
  if (b.abono) {
    c.abono = {
      activo: !!b.abono.activo,
      porcentaje: entero(b.abono.porcentaje, 1, 100, 50),
      instrucciones: limpiarTexto(b.abono.instrucciones, 600),
    };
    if (c.abono.activo && !c.abono.instrucciones) {
      throw new ErrorCancha(400, "Si pides abono, escribe cómo pagarlo (datos de transferencia)");
    }
  }
  if (Array.isArray(b.reglas)) {
    c.reglas = b.reglas.map((r) => limpiarTexto(r, 200)).filter(Boolean).slice(0, 12);
  }
  if (b.mensajePublico !== undefined) c.mensajePublico = limpiarTexto(b.mensajePublico, 500);
  if (b.confirmacionAutomatica !== undefined) c.confirmacionAutomatica = !!b.confirmacionAutomatica;
  if (b.anticipacion) {
    c.anticipacion = {
      diasMaximo: entero(b.anticipacion.diasMaximo, 1, 120, 30),
      minutosMinimo: entero(b.anticipacion.minutosMinimo, 0, 1440, 60),
    };
  }
  if (b.cancelacion) {
    c.cancelacion = {
      permitidaWeb: !!b.cancelacion.permitidaWeb,
      horasMinimo: entero(b.cancelacion.horasMinimo, 0, 168, 12),
    };
  }
  if (b.maxReservasPorTelefono !== undefined) c.maxReservasPorTelefono = entero(b.maxReservasPorTelefono, 1, 20, 3);
  if (b.recordatorio) {
    c.recordatorio = { activo: !!b.recordatorio.activo, horasAntes: entero(b.recordatorio.horasAntes, 1, 48, 3) };
  }
  if (Array.isArray(b.telefonosAviso)) {
    const tels = b.telefonosAviso.map((t) => limpiarTexto(t, 20)).filter(Boolean);
    if (tels.some((t) => !esTelefonoValido(t))) throw new ErrorCancha(400, "Uno de los WhatsApp de aviso no es válido");
    c.telefonosAviso = [...new Set(tels)].slice(0, 5);
  }
  return c;
};

export const guardarConfiguracion = async (req, res) => {
  try {
    const actual = await obtenerConfig(req.usuario.empresaId);
    const cambios = configDesdeBody(req.body || {}, actual);
    const config = await ConfiguracionCancha.findOneAndUpdate(
      { empresa: req.usuario.empresaId },
      { $set: cambios },
      { new: true, runValidators: true },
    ).lean();
    return res.json({ config });
  } catch (error) {
    return fallo(res, "guardar configuración", error);
  }
};

/* ─────────── Agenda semanal ─────────── */

export const agenda = async (req, res) => {
  try {
    const config = await obtenerConfig(req.usuario.empresaId);
    const desde = esFechaValida(req.query.desde) ? req.query.desde : hoyChile();
    const dias = entero(req.query.dias, 1, 31, 7);
    const hasta = sumarDias(desde, dias - 1);
    const [reservas, espera] = await Promise.all([
      reservasActivasEnRango(req.usuario.empresaId, desde, hasta),
      esperandoEnRango(req.usuario.empresaId, desde, hasta),
    ]);
    const salida = disponibilidad(config, reservas, desde, dias, { detalle: true });
    // Quiénes están en la lista de espera de cada hora
    salida.forEach((d) => d.horas.forEach((h) => (h.espera = espera[`${d.fecha} ${h.hora}`] || [])));
    return res.json({
      dias: salida,
      hoy: hoyChile(),
      precios: config.precios,
      permiteMedia: config.permiteMedia,
    });
  } catch (error) {
    return fallo(res, "agenda", error);
  }
};

/* ─────────── Listado ─────────── */

export const listarReservas = async (req, res) => {
  try {
    const filtro = { empresa: req.usuario.empresaId };
    const { desde, hasta, estado, q } = req.query;
    if (esFechaValida(desde) || esFechaValida(hasta)) {
      filtro.fecha = {};
      if (esFechaValida(desde)) filtro.fecha.$gte = desde;
      if (esFechaValida(hasta)) filtro.fecha.$lte = hasta;
    }
    if (ESTADOS.includes(estado)) filtro.estado = estado;
    const texto = limpiarTexto(q, 60);
    if (texto) {
      const re = new RegExp(escaparRegex(texto), "i");
      filtro.$or = [{ "cliente.nombre": re }, { "cliente.telefono": re }, { equipo: re }, { codigo: re }];
    }
    const reservas = await ReservaCancha.find(filtro)
      .select("-tokenCancelacionHash -historial")
      .sort({ inicio: -1 })
      .limit(entero(req.query.limite, 1, 500, 200))
      .lean();
    return res.json({ reservas });
  } catch (error) {
    return fallo(res, "listar", error);
  }
};

export const obtenerReserva = async (req, res) => {
  try {
    const reserva = await ReservaCancha.findOne({ _id: req.params.id, empresa: req.usuario.empresaId })
      .select("-tokenCancelacionHash")
      .lean();
    if (!reserva) return res.status(404).json({ message: "Reserva no encontrada" });
    return res.json({ reserva });
  } catch (error) {
    return fallo(res, "obtener", error);
  }
};

/* ─────────── Crear (panel), incluida la reserva fija semanal ─────────── */

export const crearReserva = async (req, res) => {
  try {
    const empresa = await empresaDe(req);
    const config = await obtenerConfig(req.usuario.empresaId);
    const actor = actorDe(req);
    const body = req.body || {};
    const semanas = entero(body.semanas, 1, MAX_SEMANAS_SERIE, 1);
    const pagado = body.pagado === true;

    if (semanas === 1) {
      const { reserva, token } = await crearReservaCancha(empresa, config, body, { panel: true, actor });
      if (pagado) {
        reserva.pago = { estado: "pagado", montoPagado: reserva.precio, actualizadoEn: new Date() };
        await ReservaCancha.updateOne({ _id: reserva._id }, { $set: { pago: reserva.pago } });
      }
      if (body.notificarCliente !== false && reserva.cliente.email) {
        notificar(() => correoReservaCliente(reserva, empresa, { token, config }));
      }
      return res.status(201).json({ creadas: [reserva], omitidas: [] });
    }

    // Reserva fija: misma hora y tipo, una vez por semana. Las semanas que
    // choquen (ocupada, día cerrado...) se informan y no frenan el resto.
    const serieId = crypto.randomUUID();
    const creadas = [];
    const omitidas = [];
    for (let i = 0; i < semanas; i++) {
      const fecha = sumarDias(body.fecha, i * 7);
      try {
        const { reserva } = await crearReservaCancha(
          empresa,
          config,
          { ...body, fecha },
          { panel: true, actor, serie: { id: serieId, numero: i + 1, total: semanas } },
        );
        creadas.push(reserva);
      } catch (e) {
        if (!(e instanceof ErrorCancha)) throw e;
        omitidas.push({ fecha, motivo: e.message });
      }
    }
    if (!creadas.length) {
      return res.status(409).json({ message: "No se pudo reservar ninguna de las semanas", omitidas });
    }
    return res.status(201).json({ creadas, omitidas, serie: serieId });
  } catch (error) {
    return fallo(res, "crear", error);
  }
};

/* ─────────── Editar datos (sin cambiar hora ni tipo) ─────────── */

export const editarReserva = async (req, res) => {
  try {
    const b = req.body || {};
    const set = {};
    if (b.nombre !== undefined) {
      const nombre = limpiarTexto(b.nombre, 80);
      if (nombre.length < 2) return res.status(400).json({ message: "El nombre es muy corto" });
      set["cliente.nombre"] = nombre;
    }
    if (b.telefono !== undefined) {
      if (!esTelefonoValido(b.telefono)) return res.status(400).json({ message: "Teléfono inválido" });
      set["cliente.telefono"] = limpiarTexto(b.telefono, 20);
      set["cliente.telefonoNormalizado"] = String(b.telefono).replace(/\D/g, "").slice(-9);
    }
    if (b.equipo !== undefined) set.equipo = limpiarTexto(b.equipo, 60);
    if (b.comentarios !== undefined) set.comentarios = limpiarTexto(b.comentarios, 300);
    if (b.precio !== undefined) set.precio = entero(b.precio, 0, 10000000, 0);
    if (!Object.keys(set).length) return res.status(400).json({ message: "No hay cambios" });

    const reserva = await ReservaCancha.findOneAndUpdate(
      { _id: req.params.id, empresa: req.usuario.empresaId },
      { $set: set, $push: { historial: entradaHistorial(actorDe(req), "editada", { detalle: Object.keys(set).join(", ") }) } },
      { new: true },
    )
      .select("-tokenCancelacionHash")
      .lean();
    if (!reserva) return res.status(404).json({ message: "Reserva no encontrada" });
    return res.json({ reserva });
  } catch (error) {
    return fallo(res, "editar", error);
  }
};

/* ─────────── Estado ─────────── */

const TEXTO_ESTADO = {
  confirmada: "Confirmada",
  completada: "Jugada",
  no_asistio: "No llegaron",
  cancelada: "Cancelada",
};

export const cambiarEstado = async (req, res) => {
  try {
    const { estado, motivo, todaLaSerie } = req.body || {};
    if (!ESTADOS.includes(estado)) return res.status(400).json({ message: "Estado inválido" });

    const reserva = await ReservaCancha.findOne({ _id: req.params.id, empresa: req.usuario.empresaId }).lean();
    if (!reserva) return res.status(404).json({ message: "Reserva no encontrada" });
    if (!puedeTransicionar(reserva.estado, estado)) {
      return res.status(400).json({ message: `Una reserva ${reserva.estado.replace("_", " ")} no puede pasar a ${estado.replace("_", " ")}` });
    }
    // No se marca como jugada / no llegó algo que todavía no empieza
    if (["completada", "no_asistio"].includes(estado) && new Date(reserva.inicio) > new Date()) {
      return res.status(400).json({ message: "Esa reserva todavía no se juega" });
    }

    const actor = actorDe(req);
    const set = { estado };
    if (estado === "cancelada") {
      set.activa = false;
      set.cancelacion = { fecha: new Date(), por: "local", motivo: limpiarTexto(motivo, 200) };
    }

    // Cancelar la reserva fija completa: esta y las siguientes de la serie
    const filtro =
      estado === "cancelada" && todaLaSerie && reserva.serie?.id
        ? {
            empresa: req.usuario.empresaId,
            "serie.id": reserva.serie.id,
            inicio: { $gte: reserva.inicio },
            estado: { $in: ["pendiente", "confirmada"] },
          }
        : { _id: reserva._id, estado: reserva.estado };

    const resultado = await ReservaCancha.updateMany(filtro, {
      $set: set,
      $push: { historial: entradaHistorial(actor, TEXTO_ESTADO[estado] || estado, { detalle: limpiarTexto(motivo, 200) }) },
    });
    if (!resultado.modifiedCount) return res.status(409).json({ message: "La reserva cambió mientras tanto. Recarga la agenda." });

    const actualizada = await ReservaCancha.findById(reserva._id).select("-tokenCancelacionHash").lean();
    // Se liberaron horas: avisar a la lista de espera
    if (estado === "cancelada") {
      const liberadas = filtro._id
        ? [{ fecha: reserva.fecha, hora: reserva.hora }]
        : await ReservaCancha.find({ empresa: req.usuario.empresaId, "serie.id": reserva.serie.id, inicio: { $gte: reserva.inicio }, estado: "cancelada" })
            .select("fecha hora")
            .lean();
      revisarEnSegundoPlano(req.usuario.empresaId, liberadas);
    }
    const empresa = await empresaDe(req);
    if (req.body?.notificarCliente !== false && actualizada.cliente.email) {
      if (estado === "confirmada") {
        const config = await obtenerConfig(req.usuario.empresaId);
        notificar(() => correoReservaConfirmada(actualizada, empresa, { config }));
      }
      if (estado === "cancelada") notificar(() => correoReservaCancelada(actualizada, empresa));
    }
    return res.json({ reserva: actualizada, afectadas: resultado.modifiedCount });
  } catch (error) {
    return fallo(res, "estado", error);
  }
};

/* ─────────── Pago ─────────── */

export const registrarPago = async (req, res) => {
  try {
    const reserva = await ReservaCancha.findOne({ _id: req.params.id, empresa: req.usuario.empresaId }).lean();
    if (!reserva) return res.status(404).json({ message: "Reserva no encontrada" });
    if (reserva.estado === "cancelada") return res.status(400).json({ message: "La reserva está cancelada" });

    const { estado } = req.body || {};
    let montoPagado;
    if (estado === "pagado") montoPagado = reserva.precio;
    else if (estado === "pendiente") montoPagado = 0;
    else if (estado === "abonado") {
      montoPagado = entero(req.body.monto ?? reserva.abono?.monto, 0, reserva.precio, 0);
      if (!montoPagado) return res.status(400).json({ message: "Indica el monto del abono" });
      if (montoPagado >= reserva.precio) return res.status(400).json({ message: "Ese monto cubre todo: márcala como pagada" });
    } else return res.status(400).json({ message: "Estado de pago inválido" });

    const set = { pago: { estado, montoPagado, actualizadoEn: new Date() } };
    // Con abono pedido, pagar (o abonar) confirma la reserva pendiente
    const confirmar = reserva.estado === "pendiente" && estado !== "pendiente";
    if (confirmar) set.estado = "confirmada";

    const historial = [entradaHistorial(actorDe(req), "pago", { detalle: `${estado} $${montoPagado.toLocaleString("es-CL")}` })];
    if (confirmar) historial.push(entradaHistorial(actorDe(req), "Confirmada", { detalle: "Al registrar el pago" }));

    const actualizada = await ReservaCancha.findOneAndUpdate(
      { _id: reserva._id },
      { $set: set, $push: { historial: { $each: historial } } },
      { new: true },
    )
      .select("-tokenCancelacionHash")
      .lean();

    if (confirmar && actualizada.cliente.email) {
      const [empresa, config] = await Promise.all([empresaDe(req), obtenerConfig(req.usuario.empresaId)]);
      notificar(() => correoReservaConfirmada(actualizada, empresa, { config }));
    }
    return res.json({ reserva: actualizada });
  } catch (error) {
    return fallo(res, "pago", error);
  }
};

/* ─────────── Resumen del mes (dueño) ─────────── */

export const resumen = async (req, res) => {
  try {
    const hoy = hoyChile();
    const mes = mesValido(req.query.mes) ? req.query.mes : hoy.slice(0, 7);
    const [anio, m] = mes.split("-").map(Number);
    const config = await obtenerConfig(req.usuario.empresaId);
    const empresa = req.usuario.empresaId;

    const delMes = await ReservaCancha.find({ empresa, fecha: { $gte: `${mes}-01`, $lte: finDeMes(mes) } })
      .select("fecha hora tipo lados estado precio pago cliente equipo")
      .lean();
    const actual = resumenDelMes(delMes, config, anio, m - 1);

    const ant = mesAnterior(mes);
    const [aa, ma] = ant.split("-").map(Number);
    const delAnterior = await ReservaCancha.find({ empresa, fecha: { $gte: `${ant}-01`, $lte: finDeMes(ant) } })
      .select("fecha hora tipo lados estado precio pago cliente")
      .lean();
    const anterior = resumenDelMes(delAnterior, config, aa, ma - 1);

    // Ingresos de los últimos 6 meses (para el gráfico)
    let cursor = mes;
    const meses = [];
    for (let i = 0; i < 6; i++) {
      meses.unshift(cursor);
      cursor = mesAnterior(cursor);
    }
    const historico = await ReservaCancha.aggregate([
      {
        $match: {
          empresa: new mongoose.Types.ObjectId(String(empresa)),
          fecha: { $gte: `${meses[0]}-01`, $lte: finDeMes(mes) },
          estado: { $in: ESTADOS_ARRIENDO },
        },
      },
      { $group: { _id: { $substr: ["$fecha", 0, 7] }, ingresos: { $sum: "$precio" }, arriendos: { $sum: 1 } } },
    ]);
    const porMes = meses.map((x) => {
      const f = historico.find((h) => h._id === x);
      return { mes: x, ingresos: f?.ingresos || 0, arriendos: f?.arriendos || 0 };
    });

    // Lo que viene: próximas reservas activas (hoy en adelante)
    const proximas = await ReservaCancha.find({
      empresa,
      activa: true,
      estado: { $in: ["pendiente", "confirmada"] },
      inicio: { $gte: new Date(Date.now() - 60 * 60000) },
    })
      .select("codigo fecha hora tipo lados estado cliente equipo precio pago abono serie")
      .sort({ inicio: 1 })
      .limit(8)
      .lean();

    // Por cobrar de partidos ya jugados (lo que hay que perseguir)
    const deudas = delMes
      .filter((r) => r.estado === "completada" && (r.pago?.montoPagado || 0) < r.precio)
      .map((r) => ({ _id: r._id, fecha: r.fecha, hora: r.hora, nombre: r.equipo || r.cliente?.nombre, telefono: r.cliente?.telefono, debe: r.precio - (r.pago?.montoPagado || 0) }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora));

    return res.json({
      mes,
      hoy,
      diaSemanaHoy: diaSemana(hoy),
      actual,
      anterior: { arriendos: anterior.arriendos, ingresos: anterior.ingresos, ocupacion: anterior.ocupacion },
      porMes,
      proximas,
      deudas,
      precios: config.precios,
    });
  } catch (error) {
    return fallo(res, "resumen", error);
  }
};
