// utils/giftcards.js
//
// Reglas de las giftcards: código, saldo, estado y canje al reservar.
// Lo usado se calcula desde las reservas (reserva.giftcard), no se guarda en
// la giftcard: una reserva cancelada o reagendada deja de contar sola.
import crypto from "crypto";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import GiftCard from "../models/giftCard.model.js";
import Reserva from "../models/reserva.model.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const ZONA = "America/Santiago";
export const ESTADOS_QUE_NO_CUENTAN = ["cancelada", "reagendada"];

// Sin 0/O, 1/I/L para que no se confundan al dictarlo o escribirlo
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const CONFIG_GIFTCARDS_DEFECTO = {
  activa: false,
  permitirServicio: true,
  permitirMonto: true,
  montoMinimo: 5000,
  montoMaximo: 200000,
  mesesVigencia: 6,
  instrucciones: "",
};

/** Config del negocio con los valores por defecto para lo que no haya guardado. */
export const configGiftcards = (empresa) => {
  const c = empresa?.giftcards?.toObject ? empresa.giftcards.toObject() : empresa?.giftcards || {};
  const out = { ...CONFIG_GIFTCARDS_DEFECTO };
  for (const k of Object.keys(out)) if (c[k] !== undefined && c[k] !== null) out[k] = c[k];
  return out;
};

export const generarCodigoGiftcard = () => {
  const parte = () =>
    Array.from({ length: 4 }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join("");
  return `GC-${parte()}-${parte()}`;
};

/**
 * "gc 7k3p-x2mq" / "GC7K3PX2MQ" → "GC-7K3P-X2MQ". Devuelve "" si no tiene
 * forma de giftcard (entonces el código se trata como código de descuento).
 */
export const normalizarCodigoGiftcard = (texto) => {
  const limpio = String(texto || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = limpio.match(/^GC([A-Z0-9]{4})([A-Z0-9]{4})$/);
  return m ? `GC-${m[1]}-${m[2]}` : "";
};
export const esCodigoGiftcard = (texto) => !!normalizarCodigoGiftcard(texto);

export const calcularVencimiento = (meses, desde = new Date()) =>
  dayjs(desde).tz(ZONA).add(Math.max(1, Number(meses) || 6), "month").endOf("day").toDate();

/** Reservas que usaron la giftcard (sin canceladas ni reagendadas). */
export const usosGiftcard = (giftcardId, { excluirReservaId = null } = {}) => {
  const filtro = { "giftcard.giftcardId": giftcardId, estado: { $nin: ESTADOS_QUE_NO_CUENTAN } };
  if (excluirReservaId) filtro._id = { $ne: excluirReservaId };
  return Reserva.find(filtro).select("_id fecha estado giftcard cliente servicioSnapshot barbero").lean();
};

/**
 * Estado para mostrar + saldo, a partir de la giftcard y sus usos.
 * estados: pendiente | rechazada | anulada | activa | usada | vencida
 */
export const resumenGiftcard = (gc, usos = [], ahora = new Date()) => {
  const usado = usos.reduce((s, u) => s + (Number(u.giftcard?.montoAplicado) || 0), 0);
  const saldo = gc.tipo === "monto" ? Math.max(0, Number(gc.monto) - usado) : usos.length ? 0 : Number(gc.monto);
  let estado = gc.estado;
  if (gc.estado === "activa") {
    const agotada = gc.tipo === "servicio" ? usos.length > 0 : saldo <= 0;
    if (agotada) estado = "usada";
    else if (gc.venceEn && new Date(gc.venceEn) < ahora) estado = "vencida";
  }
  return { estado, saldo, usado, usos: usos.length };
};

const fechaCorta = (d) => dayjs(d).tz(ZONA).format("DD-MM-YYYY");

/**
 * ¿Se puede usar esta giftcard para este servicio? Calcula el precio.
 * @returns {Promise<{ok:true, gc, descuento, precioOriginal, precioFinal, saldoRestante} | {ok:false, message}>}
 */
export const evaluarGiftcard = async ({ empresaId, codigo, servicioId, precioBase, excluirReservaId = null }) => {
  const normalizado = normalizarCodigoGiftcard(codigo);
  if (!normalizado) return { ok: false, message: "El código no es válido" };

  const gc = await GiftCard.findOne({ empresa: empresaId, codigo: normalizado }).lean();
  if (!gc || ["pendiente", "rechazada"].includes(gc.estado)) {
    return { ok: false, message: "La giftcard no es válida" };
  }
  if (gc.estado === "anulada") return { ok: false, message: "Esta giftcard fue anulada por el local" };

  const usos = await usosGiftcard(gc._id, { excluirReservaId });
  const r = resumenGiftcard(gc, usos);
  if (r.estado === "usada") {
    return { ok: false, message: gc.tipo === "servicio" ? "Esta giftcard ya fue usada" : "Esta giftcard ya no tiene saldo" };
  }
  if (r.estado === "vencida") return { ok: false, message: `Esta giftcard venció el ${fechaCorta(gc.venceEn)}` };

  if (gc.tipo === "servicio" && String(gc.servicio) !== String(servicioId)) {
    return { ok: false, message: `Esta giftcard es para «${gc.servicioNombre || "otro servicio"}»` };
  }

  const precio = Number(precioBase) || 0;
  if (precio <= 0) return { ok: false, message: "Este servicio no tiene costo" };

  // Servicio: lo cubre entero (aunque haya subido de precio). Monto: hasta el saldo.
  const descuento = gc.tipo === "servicio" ? precio : Math.min(r.saldo, precio);
  return {
    ok: true,
    gc,
    descuento,
    precioOriginal: precio,
    precioFinal: precio - descuento,
    saldoRestante: gc.tipo === "monto" ? r.saldo - descuento : 0,
  };
};

/**
 * Después de crear la reserva: si dos personas usaron la misma giftcard al
 * mismo tiempo, una de las dos se pasa del valor. Devuelve false en ese caso
 * (la reserva recién creada se deshace).
 */
export const consumoGiftcardValido = async (giftcardId) => {
  const gc = await GiftCard.findById(giftcardId).select("tipo monto").lean();
  if (!gc) return false;
  const usos = await usosGiftcard(giftcardId);
  if (gc.tipo === "servicio") return usos.length <= 1;
  const usado = usos.reduce((s, u) => s + (Number(u.giftcard?.montoAplicado) || 0), 0);
  return usado <= Number(gc.monto);
};
