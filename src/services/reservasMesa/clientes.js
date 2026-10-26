// Clientes de reservas de mesa y permiso para enviarles promociones.
import crypto from "crypto";
import mongoose from "mongoose";
import ClienteReservaMesa from "../../models/clienteReservaMesa.model.js";
import CampanaReservaMesa from "../../models/campanaReservaMesa.model.js";
import ReservaMesa from "../../models/reservaMesa.model.js";
import { escaparRegex } from "./utilidades.js";
import { correoPromocion } from "./correos.js";

// Tope por envío. Además, el plan de Resend tiene su propio límite diario.
export const MAX_DESTINATARIOS_POR_PROMOCION = 500;
// Pausa entre correos para no pasar el límite de envíos por segundo de Resend
const PAUSA_ENTRE_CORREOS_MS = 600;
// Una promoción que lleva este tiempo "enviando" sin avanzar se considera cortada
// (por ejemplo, el servidor se reinició a mitad del envío).
const MINUTOS_PARA_INTERRUMPIDA = 15;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const nuevoTokenBaja = () => crypto.randomBytes(24).toString("hex");
const idEmpresa = (empresaId) => new mongoose.Types.ObjectId(String(empresaId));

/**
 * Crea o actualiza el cliente de una reserva recién creada. Si aceptó
 * promociones, queda registrado cuándo y por dónde. Si no marcó la casilla,
 * NO se le quita un permiso que haya dado antes.
 */
export const registrarClienteDeReserva = async ({ empresaId, reserva, aceptaPromociones = false, origen, actorNombre = "" }) => {
  const c = reserva.cliente;
  const set = { nombre: c.nombre, telefono: c.telefono, ...(c.email ? { email: c.email } : {}) };
  if (aceptaPromociones) {
    Object.assign(set, {
      "promociones.acepta": true,
      "promociones.aceptoEn": new Date(),
      "promociones.origen": origen,
      "promociones.bajaEn": null,
      "promociones.actualizadoPor": actorNombre || (origen === "web" ? "cliente (web)" : "panel"),
    });
  }
  const filtro = { empresa: empresaId, telefonoNormalizado: c.telefonoNormalizado };
  const operacion = { $set: set, $setOnInsert: { tokenBaja: nuevoTokenBaja() } };
  try {
    await ClienteReservaMesa.updateOne(filtro, operacion, { upsert: true });
  } catch (e) {
    // Dos reservas del mismo teléfono al mismo tiempo: la segunda reintenta
    if (e?.code === 11000) await ClienteReservaMesa.updateOne(filtro, { $set: set });
    else throw e;
  }
};

/**
 * Lista de clientes armada desde las reservas (así aparecen también los que
 * reservaron antes de existir esta lista), con su permiso de promociones.
 */
export const listarClientes = async ({ empresaId, q = "", promo = "", pagina = 1, porPagina = 25 }) => {
  const filtros = [];
  const texto = String(q || "").trim();
  if (texto) {
    const re = new RegExp(escaparRegex(texto), "i");
    const digitos = texto.replace(/\D/g, "");
    filtros.push({
      $or: [{ nombre: re }, { emails: re }, ...(digitos.length >= 3 ? [{ _id: new RegExp(digitos) }] : [])],
    });
  }
  if (promo === "si") filtros.push({ "ficha.promociones.acepta": true });
  if (promo === "no") filtros.push({ "ficha.promociones.acepta": { $ne: true } });

  const [r] = await ReservaMesa.aggregate([
    { $match: { empresa: idEmpresa(empresaId) } },
    { $sort: { inicio: -1 } },
    {
      $group: {
        _id: "$cliente.telefonoNormalizado",
        nombre: { $first: "$cliente.nombre" },
        telefono: { $first: "$cliente.telefono" },
        emails: { $addToSet: "$cliente.email" },
        reservas: { $sum: 1 },
        visitas: { $sum: { $cond: [{ $in: ["$estado", ["llego", "completada"]] }, 1, 0] } },
        noAsistio: { $sum: { $cond: [{ $eq: ["$estado", "no_asistio"] }, 1, 0] } },
        cumpleanos: { $sum: { $cond: ["$cumpleanos.es", 1, 0] } },
        ultima: { $max: "$fecha" },
        primera: { $min: "$fecha" },
      },
    },
    {
      $lookup: {
        from: "clientesReservaMesa",
        let: { tel: "$_id" },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ["$empresa", idEmpresa(empresaId)] }, { $eq: ["$telefonoNormalizado", "$$tel"] }] } } },
          { $project: { email: 1, promociones: 1 } },
        ],
        as: "ficha",
      },
    },
    { $unwind: { path: "$ficha", preserveNullAndEmptyArrays: true } },
    ...(filtros.length ? [{ $match: { $and: filtros } }] : []),
    { $sort: { ultima: -1, _id: 1 } },
    {
      $facet: {
        items: [{ $skip: (pagina - 1) * porPagina }, { $limit: porPagina }],
        total: [{ $count: "n" }],
      },
    },
  ]);

  const items = (r?.items || []).map((c) => ({
    telefonoNormalizado: c._id,
    nombre: c.nombre,
    telefono: c.telefono,
    email: c.ficha?.email || c.emails.find(Boolean) || "",
    reservas: c.reservas,
    visitas: c.visitas,
    noAsistio: c.noAsistio,
    cumpleanos: c.cumpleanos,
    ultima: c.ultima,
    primera: c.primera,
    promociones: {
      acepta: !!c.ficha?.promociones?.acepta,
      aceptoEn: c.ficha?.promociones?.aceptoEn || null,
      origen: c.ficha?.promociones?.origen || null,
      bajaEn: c.ficha?.promociones?.bajaEn || null,
    },
  }));
  const total = r?.total?.[0]?.n || 0;
  return { items, total, pagina, porPagina, paginas: Math.max(1, Math.ceil(total / porPagina)) };
};

/** Clientes que recibirían una promoción: aceptaron y tienen correo. */
export const filtroDestinatarios = (empresaId) => ({
  empresa: empresaId,
  "promociones.acepta": true,
  email: { $nin: ["", null] },
});

export const contarClientes = async (empresaId) => {
  const [clientes, suscritos, destinatarios] = await Promise.all([
    ReservaMesa.distinct("cliente.telefonoNormalizado", { empresa: empresaId }).then((x) => x.length),
    ClienteReservaMesa.countDocuments({ empresa: empresaId, "promociones.acepta": true }),
    ClienteReservaMesa.countDocuments(filtroDestinatarios(empresaId)),
  ]);
  return { clientes, suscritos, destinatarios };
};

/**
 * El panel marca o quita el permiso (por ejemplo, el cliente lo pidió por
 * teléfono). Si el cliente aún no tiene ficha, se crea con su última reserva.
 */
export const cambiarPermisoPromociones = async ({ empresaId, telefonoNormalizado, acepta, actorNombre }) => {
  let ficha = await ClienteReservaMesa.findOne({ empresa: empresaId, telefonoNormalizado });
  if (!ficha) {
    const ultima = await ReservaMesa.findOne({ empresa: empresaId, "cliente.telefonoNormalizado": telefonoNormalizado })
      .sort({ inicio: -1 })
      .lean();
    if (!ultima) return null;
    ficha = new ClienteReservaMesa({
      empresa: empresaId,
      telefonoNormalizado,
      nombre: ultima.cliente.nombre,
      telefono: ultima.cliente.telefono,
      email: ultima.cliente.email || "",
      tokenBaja: nuevoTokenBaja(),
    });
  }
  if (acepta) {
    ficha.set("promociones", { acepta: true, aceptoEn: new Date(), origen: "panel", bajaEn: null, actualizadoPor: actorNombre });
  } else {
    ficha.set("promociones.acepta", false);
    ficha.set("promociones.bajaEn", new Date());
    ficha.set("promociones.actualizadoPor", actorNombre);
  }
  await ficha.save();
  return ficha;
};

/** Una promoción "enviando" que no avanza hace rato quedó cortada. */
export const marcarInterrumpidas = (empresaId) =>
  CampanaReservaMesa.updateMany(
    {
      empresa: empresaId,
      estado: "enviando",
      updatedAt: { $lt: new Date(Date.now() - MINUTOS_PARA_INTERRUMPIDA * 60000) },
    },
    { $set: { estado: "interrumpida", terminadaEn: new Date() } },
  );

export const hayEnvioEnCurso = async (empresaId) => {
  await marcarInterrumpidas(empresaId);
  return !!(await CampanaReservaMesa.exists({ empresa: empresaId, estado: "enviando" }));
};

/**
 * Envía la promoción en segundo plano, de a un correo, guardando el avance.
 * No se espera desde la petición HTTP: el panel consulta el avance.
 */
export const enviarPromocionEnSegundoPlano = (campana, empresa, destinatarios) => {
  Promise.resolve()
    .then(async () => {
      let enviados = 0;
      let fallidos = 0;
      for (let i = 0; i < destinatarios.length; i += 1) {
        const ok = await correoPromocion(destinatarios[i], empresa, { asunto: campana.asunto, mensaje: campana.mensaje });
        if (ok) enviados += 1;
        else fallidos += 1;
        if ((i + 1) % 10 === 0 || i === destinatarios.length - 1) {
          await CampanaReservaMesa.updateOne({ _id: campana._id }, { $set: { enviados, fallidos } });
        }
        await esperar(PAUSA_ENTRE_CORREOS_MS);
      }
      await CampanaReservaMesa.updateOne(
        { _id: campana._id },
        { $set: { enviados, fallidos, estado: fallidos ? "con_errores" : "enviada", terminadaEn: new Date() } },
      );
    })
    .catch(async (e) => {
      console.error("❌ Envío de promoción:", e);
      await CampanaReservaMesa.updateOne(
        { _id: campana._id },
        { $set: { estado: "interrumpida", terminadaEn: new Date() } },
      ).catch(() => {});
    });
};

/** Baja con el link del correo. Devuelve la ficha (o null si el link no sirve). */
export const darDeBajaPorToken = async (token) => {
  if (!token || typeof token !== "string" || token.length < 32) return null;
  return ClienteReservaMesa.findOneAndUpdate(
    { tokenBaja: token },
    { $set: { "promociones.acepta": false, "promociones.bajaEn": new Date(), "promociones.actualizadoPor": "cliente (link del correo)" } },
    { new: true },
  ).lean();
};
