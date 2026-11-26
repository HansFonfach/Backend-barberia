// services/mercadoPago/api.js
//
// Llamadas a la API de Mercado Pago (sin SDK: fetch nativo de Node 18+).
// Credenciales en el .env del back:
//   MP_ACCESS_TOKEN   → Access Token (de prueba o de producción)
//   MP_WEBHOOK_SECRET → clave secreta de los webhooks (opcional, ver firma.js)
//
// Se usa para el cobro de la mensualidad de AgendaFonfach:
//  - pago único con Checkout Pro (API de Orders): el negocio paga 1 mes;
//  - pago automático (suscripción / preapproval): se le cobra solo cada mes.
import crypto from "crypto";

const BASE = "https://api.mercadopago.com";

export const mercadoPagoConfigurado = () => Boolean(process.env.MP_ACCESS_TOKEN);

export class ErrorMercadoPago extends Error {
  constructor(mensaje, status, detalle) {
    super(mensaje);
    this.name = "ErrorMercadoPago";
    this.status = status;
    this.detalle = detalle;
  }
}

const llamar = async (ruta, { method = "GET", body, idempotencia } = {}) => {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new ErrorMercadoPago("Mercado Pago no está configurado (falta MP_ACCESS_TOKEN)", 503);

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  if (method !== "GET") headers["X-Idempotency-Key"] = idempotencia || crypto.randomUUID();

  const controlador = new AbortController();
  const corte = setTimeout(() => controlador.abort(), 15000);
  let res;
  try {
    res = await fetch(`${BASE}${ruta}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controlador.signal,
    });
  } catch (e) {
    throw new ErrorMercadoPago(`No se pudo conectar con Mercado Pago (${e.name === "AbortError" ? "tiempo agotado" : e.message})`, 502);
  } finally {
    clearTimeout(corte);
  }

  const texto = await res.text();
  let datos = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    datos = { texto };
  }
  if (!res.ok) {
    // Mercado Pago dice QUÉ campo falló en errors[].details: se incluye en el mensaje
    const detalles = (datos?.errors || [])
      .map((e) => [e.message, ...(Array.isArray(e.details) ? e.details : [])].filter(Boolean).join(": "))
      .filter(Boolean)
      .join(" | ");
    const mensaje = detalles || datos?.message || datos?.error || `Error ${res.status} de Mercado Pago`;
    throw new ErrorMercadoPago(mensaje, res.status, datos);
  }
  return datos;
};

const monto = (n) => String(Math.round(Number(n) || 0));
const esHttps = (url) => /^https:\/\//i.test(url || "");

/* ───────────── Pago único (Checkout Pro, API de Orders) ───────────── */

/**
 * Crea una orden de Checkout Pro y devuelve { id, checkout_url, ... }.
 * `urls` = { exito, fallo, pendiente, webhook }.
 */
export const crearOrdenCheckout = ({ total, titulo, descripcion, referencia, email, urls = {}, idempotencia }) => {
  // Mercado Pago solo acepta direcciones https para volver al sitio. En local
  // (http://localhost) se omiten: el negocio vuelve a mano y pincha
  // "Ya pagué, revisar mi pago".
  const online = {};
  if (esHttps(urls.exito)) {
    online.success_url = urls.exito;
    online.failure_url = esHttps(urls.fallo) ? urls.fallo : urls.exito;
    online.pending_url = esHttps(urls.pendiente) ? urls.pendiente : urls.exito;
    online.auto_return = "approved";
  }
  if (esHttps(urls.webhook)) online.callback_url = urls.webhook;

  return llamar("/v1/orders", {
    method: "POST",
    idempotencia,
    body: {
      type: "online",
      processing_mode: "manual",
      capture_mode: "automatic",
      total_amount: monto(total),
      external_reference: referencia,
      description: descripcion || titulo,
      expiration_time: "P1D",
      ...(email ? { payer: { email } } : {}),
      items: [{ title: titulo, quantity: 1, unit_price: monto(total), external_code: "PLAN-MENSUAL" }],
      config: { statement_descriptor: "AGENDAFONF", ...(Object.keys(online).length ? { online } : {}) },
    },
  });
};

export const obtenerOrden = (id) => llamar(`/v1/orders/${encodeURIComponent(id)}`);

/** ¿La orden quedó pagada? */
export const ordenPagada = (orden) => {
  if (!orden) return false;
  if (orden.status === "processed" && (!orden.status_detail || orden.status_detail === "accredited")) return true;
  const pagado = Number(orden.total_paid_amount || 0);
  return pagado > 0 && pagado >= Number(orden.total_amount || 0) && !["refunded", "canceled", "cancelled"].includes(orden.status);
};

/* ───────────── Pago automático (suscripción / preapproval) ───────────── */

export const crearSuscripcion = ({ monto: valor, motivo, referencia, email, urlRetorno, inicio }) =>
  llamar("/preapproval", {
    method: "POST",
    body: {
      reason: motivo,
      external_reference: referencia,
      payer_email: email,
      // Debe ser https: en local se usa el sitio publicado y se vuelve a mano
      back_url: esHttps(urlRetorno) ? urlRetorno : "https://www.agendafonfach.cl",
      status: "pending",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: Math.round(Number(valor) || 0),
        currency_id: "CLP",
        ...(inicio ? { start_date: new Date(inicio).toISOString() } : {}),
      },
    },
  });

export const obtenerSuscripcion = (id) => llamar(`/preapproval/${encodeURIComponent(id)}`);

export const cancelarSuscripcion = (id) =>
  llamar(`/preapproval/${encodeURIComponent(id)}`, { method: "PUT", body: { status: "cancelled" } });

/** Cada cobro mensual de una suscripción ("authorized payment"). */
export const obtenerPagoAutorizado = (id) => llamar(`/authorized_payments/${encodeURIComponent(id)}`);

export const pagoAutorizadoAprobado = (pago) =>
  Boolean(pago) && (pago.payment?.status === "approved" || (pago.status === "processed" && !pago.payment?.status));
