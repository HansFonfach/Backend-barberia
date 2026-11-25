// node --test test/pruebaGratis.test.js
import { test } from "node:test";
import assert from "node:assert/strict";

const { finDePrueba, diasRestantesPrueba, avisoPruebaPendiente } = await import("../src/utils/pruebaGratis.js");

const DIA = 24 * 60 * 60 * 1000;
const ahora = new Date("2026-11-23T13:00:00Z");
const emp = (diasHastaFin, extra = {}) => ({
  estado: "activo",
  estadoSuscripcion: "trial",
  trial: { activo: true, fin: new Date(ahora.getTime() + diasHastaFin * DIA), ...extra },
});

test("la prueba dura 7 días", () => {
  assert.equal(finDePrueba(ahora).getTime() - ahora.getTime(), 7 * DIA);
});

test("días restantes", () => {
  assert.equal(diasRestantesPrueba(new Date(ahora.getTime() + 2.5 * DIA), ahora), 3);
  assert.equal(diasRestantesPrueba(new Date(ahora.getTime() - 1 * DIA), ahora), -1);
});

test("con más de 2 días por delante no hay aviso", () => {
  assert.equal(avisoPruebaPendiente(emp(5), ahora), null);
});

test("le quedan 2 días: aviso previo, una sola vez", () => {
  assert.equal(avisoPruebaPendiente(emp(1.5), ahora), "previo");
  assert.equal(avisoPruebaPendiente(emp(1.5, { avisoPrevio: new Date() }), ahora), null);
});

test("recién vencida: aviso de vencimiento, una sola vez", () => {
  assert.equal(avisoPruebaPendiente(emp(-0.5), ahora), "vencido");
  assert.equal(avisoPruebaPendiente(emp(-0.5, { avisoVencido: new Date() }), ahora), null);
});

test("vencida hace mucho (negocio antiguo marcado como prueba): no se le escribe", () => {
  assert.equal(avisoPruebaPendiente(emp(-30), ahora), null);
});

test("ya paga, está inactiva o no tiene fecha: nada", () => {
  assert.equal(avisoPruebaPendiente({ ...emp(1), estadoSuscripcion: "activo" }, ahora), null);
  assert.equal(avisoPruebaPendiente({ ...emp(1), estado: "inactivo" }, ahora), null);
  assert.equal(avisoPruebaPendiente({ estado: "activo", estadoSuscripcion: "trial", trial: {} }, ahora), null);
});
