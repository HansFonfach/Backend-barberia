import test from "node:test";
import assert from "node:assert/strict";
import { construirCambiosEmpresa, diaChile, fechaChile, mesAnioCobro } from "../src/utils/edicionEmpresa.js";

const RUBROS = ["barberia", "restaurante", "cancha"];
const op = { rubrosValidos: RUBROS, ahora: new Date("2026-11-25T15:00:00Z") };

test("trial → activo con próximo pago: apaga la prueba y pide crear el cobro", () => {
  const actual = { estadoSuscripcion: "trial", trial: { activo: true, fin: new Date("2026-11-20T03:00:00Z") } };
  const { set, errores, cobro } = construirCambiosEmpresa(
    { estadoSuscripcion: "activo", proximoPago: "2026-12-30", cuotaMensual: "25000" },
    actual,
    op,
  );
  assert.deepEqual(errores, []);
  assert.equal(set.estadoSuscripcion, "activo");
  assert.equal(set["trial.activo"], false);
  assert.equal(set.plan, "activo");
  assert.equal(set.cuotaMensual, 25000);
  assert.equal(diaChile(set.proximoPago), "2026-12-30");
  assert.equal(set.fechaPago, 30); // no tenía día de pago
  assert.equal(cobro.accion, "mover");
});

test("no cambia el día de pago si ya tenía uno", () => {
  const { set } = construirCambiosEmpresa({ proximoPago: "2026-12-30" }, { fechaPago: 5 }, op);
  assert.equal(set.fechaPago, undefined);
});

test("misma fecha de próximo pago: no toca el cobro", () => {
  const actual = { proximoPago: fechaChile("2026-12-30") };
  const { cobro } = construirCambiosEmpresa({ proximoPago: "2026-12-30" }, actual, op);
  assert.equal(cobro, null);
});

test("borrar el próximo pago cancela el cobro pendiente", () => {
  const actual = { proximoPago: fechaChile("2026-12-30"), fechaPago: 30 };
  const { set, cobro } = construirCambiosEmpresa({ proximoPago: "" }, actual, op);
  assert.equal(set.proximoPago, null);
  assert.deepEqual(cobro, { accion: "cancelar" });
});

test("suspender guarda desde cuándo; reactivar limpia", () => {
  const s = construirCambiosEmpresa({ estadoSuscripcion: "suspendido", motivoSuspension: "no pagó" }, { estadoSuscripcion: "activo" }, op);
  assert.equal(s.set.suspendidaDesde, op.ahora);
  assert.equal(s.set.motivoSuspension, "no pagó");
  const r = construirCambiosEmpresa({ estadoSuscripcion: "activo" }, { estadoSuscripcion: "suspendido" }, op);
  assert.equal(r.set.suspendidaDesde, null);
  assert.equal(r.set.motivoSuspension, "");
});

test("alargar la prueba reinicia sus avisos", () => {
  const actual = { estadoSuscripcion: "trial", trial: { fin: fechaChile("2026-11-20", "23:59") } };
  const { set } = construirCambiosEmpresa({ finPrueba: "2026-12-05" }, actual, op);
  assert.equal(diaChile(set["trial.fin"]), "2026-12-05");
  assert.equal(set["trial.avisoPrevio"], null);
  assert.equal(set["trial.avisoVencido"], null);
});

test("valida correo, rubro, cuota, día y fechas; normaliza el teléfono", () => {
  const { set, errores } = construirCambiosEmpresa(
    { correo: "malo", rubro: "x", cuotaMensual: "-1", fechaPago: "40", proximoPago: "2026-02-31", telefono: "+56 9 1234 5678" },
    {},
    op,
  );
  assert.equal(errores.length, 5);
  assert.equal(set.telefono, "56912345678");
});

test("solo acepta módulos conocidos y campos de la lista blanca", () => {
  const { set } = construirCambiosEmpresa({ modulos: { canchas: true, hackeo: true }, slug: "otro", historialPagos: [] }, {}, op);
  assert.equal(set["modulos.canchas"], true);
  assert.equal(set["modulos.hackeo"], undefined);
  assert.equal(set.slug, undefined);
  assert.equal(set.historialPagos, undefined);
});

test("mesAnioCobro: vence en enero → mes 12 del año anterior", () => {
  assert.deepEqual(mesAnioCobro(fechaChile("2027-01-30")), { mes: 12, anio: 2026 });
  assert.deepEqual(mesAnioCobro(fechaChile("2026-12-30")), { mes: 11, anio: 2026 });
});
