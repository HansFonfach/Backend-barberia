import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { firmaWebhookValida } from "../src/services/mercadoPago/firma.js";
import { ordenPagada, pagoAutorizadoAprobado } from "../src/services/mercadoPago/api.js";
import { crearTokenPago, leerTokenPago } from "../src/utils/linkPagoPlan.js";

const firmar = (secreto, id, req, ts) =>
  crypto.createHmac("sha256", secreto).update(`id:${id};request-id:${req};ts:${ts};`).digest("hex");

test("firma de webhook válida (id alfanumérico va en minúsculas)", () => {
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = firmar("secreto", "ord01abc", "req-1", ts);
  assert.equal(firmaWebhookValida({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: "req-1", dataId: "ORD01ABC", secreto: "secreto" }), true);
});

test("firma inválida, vieja o sin secreto → rechaza", () => {
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = firmar("secreto", "123", "req-1", ts);
  assert.equal(firmaWebhookValida({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: "req-1", dataId: "124", secreto: "secreto" }), false);
  assert.equal(firmaWebhookValida({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: "req-1", dataId: "123", secreto: "otro" }), false);
  const viejo = String(Math.floor(Date.now() / 1000) - 3600);
  const v1v = firmar("secreto", "123", "req-1", viejo);
  assert.equal(firmaWebhookValida({ xSignature: `ts=${viejo},v1=${v1v}`, xRequestId: "req-1", dataId: "123", secreto: "secreto" }), false);
  assert.equal(firmaWebhookValida({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: "req-1", dataId: "123", secreto: "" }), false);
});

test("orden pagada solo si quedó acreditada", () => {
  assert.equal(ordenPagada({ status: "processed", status_detail: "accredited" }), true);
  assert.equal(ordenPagada({ status: "created", total_amount: "25000", total_paid_amount: "0" }), false);
  assert.equal(ordenPagada({ status: "action_required" }), false);
  assert.equal(ordenPagada({ status: "refunded", total_amount: "25000", total_paid_amount: "25000" }), false);
  assert.equal(ordenPagada(null), false);
});

test("cobro automático aprobado", () => {
  assert.equal(pagoAutorizadoAprobado({ status: "processed", payment: { status: "approved" } }), true);
  assert.equal(pagoAutorizadoAprobado({ status: "recycling", payment: { status: "rejected" } }), false);
});

test("token del link de pago: ida y vuelta, y rechaza basura", () => {
  const t = crearTokenPago("64b7f0c2a1b2c3d4e5f60718");
  assert.equal(leerTokenPago(t), "64b7f0c2a1b2c3d4e5f60718");
  assert.equal(leerTokenPago("basura"), null);
  assert.equal(leerTokenPago(t.slice(0, -2) + "xx"), null);
});
