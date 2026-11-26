// services/mercadoPago/firma.js
//
// Verifica que un webhook venga de verdad de Mercado Pago (header
// x-signature). La clave es MP_WEBHOOK_SECRET, la "clave secreta" que da
// Mercado Pago al configurar los webhooks de la aplicación.
//
// Igual nunca se confía en lo que dice el webhook: con el id que trae se
// vuelve a consultar el pago a Mercado Pago (la API es la fuente de verdad).
import crypto from "crypto";

/**
 * x-signature: "ts=1704908010,v1=618c8534...".
 * Plantilla firmada: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
 * (data.id en minúsculas si es alfanumérico; partes ausentes se omiten).
 */
export const firmaWebhookValida = ({ xSignature, xRequestId, dataId, secreto, ahora = Date.now(), toleranciaSeg = 600 }) => {
  if (!secreto || !xSignature) return false;
  const partes = Object.fromEntries(
    String(xSignature)
      .split(",")
      .map((p) => p.split("=").map((s) => s.trim()))
      .filter(([k, v]) => k && v),
  );
  const { ts, v1 } = partes;
  if (!ts || !v1) return false;

  // ts puede venir en segundos o milisegundos
  const tsMs = Number(ts) > 1e12 ? Number(ts) : Number(ts) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(ahora - tsMs) > toleranciaSeg * 1000) return false;

  let plantilla = "";
  if (dataId) plantilla += `id:${/^[a-z0-9]+$/i.test(dataId) ? String(dataId).toLowerCase() : dataId};`;
  if (xRequestId) plantilla += `request-id:${xRequestId};`;
  plantilla += `ts:${ts};`;

  const esperado = crypto.createHmac("sha256", secreto).update(plantilla).digest("hex");
  const a = Buffer.from(esperado, "hex");
  const b = Buffer.from(String(v1), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
