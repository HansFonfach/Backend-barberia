// node --test test/canchas.test.js
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  horasDelDia,
  estadoHora,
  asignarLados,
  validarTurno,
  precioDe,
  abonoDe,
  puedeCancelarWeb,
  puedeTransicionar,
  capacidadDelMes,
  resumenDelMes,
} = await import("../src/services/canchas/reglas.js");

const HORARIO = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({ dia, activo: dia >= 1 && dia <= 5, desde: "19:00", hasta: "22:00" }));
const CONFIG = {
  horario: HORARIO,
  diasCerrados: [{ fecha: "2026-12-25", motivo: "Navidad" }],
  permiteMedia: true,
  precios: { completa: 70000, media: 35000 },
  abono: { activo: false, porcentaje: 50 },
  anticipacion: { diasMaximo: 30, minutosMinimo: 60 },
  cancelacion: { permitidaWeb: true, horasMinimo: 12 },
};
// Lunes 23-nov-2026, 12:00 en Chile (UTC-3 en verano)
const AHORA = new Date("2026-11-23T15:00:00Z");

test("lunes a viernes de 19:00 a 22:00: la última hora agendable es 22:00", () => {
  assert.deepEqual(horasDelDia(CONFIG, "2026-11-23"), ["19:00", "20:00", "21:00", "22:00"]);
});

test("sábado y domingo no tienen horas", () => {
  assert.deepEqual(horasDelDia(CONFIG, "2026-11-28"), []);
  assert.deepEqual(horasDelDia(CONFIG, "2026-11-29"), []);
});

test("cancha libre: se puede arrendar completa o media", () => {
  assert.deepEqual(estadoHora([]), { libres: ["A", "B"], completa: true, media: true });
});

test("media cancha arrendada: queda la otra mitad, no la completa", () => {
  const e = estadoHora([{ lados: ["A"], estado: "confirmada", activa: true }]);
  assert.deepEqual(e, { libres: ["B"], completa: false, media: true });
});

test("las dos mitades o la completa: hora llena", () => {
  assert.equal(estadoHora([{ lados: ["A", "B"], estado: "confirmada", activa: true }]).media, false);
  const dos = estadoHora([
    { lados: ["A"], estado: "confirmada", activa: true },
    { lados: ["B"], estado: "pendiente", activa: true },
  ]);
  assert.equal(dos.media, false);
  assert.equal(dos.completa, false);
});

test("una reserva cancelada libera la cancha", () => {
  assert.equal(estadoHora([{ lados: ["A", "B"], estado: "cancelada", activa: false }]).completa, true);
});

test("sin media cancha habilitada no se ofrece media", () => {
  assert.equal(estadoHora([], { permiteMedia: false }).media, false);
});

test("asignar lados", () => {
  assert.deepEqual(asignarLados("completa", ["A", "B"]), ["A", "B"]);
  assert.equal(asignarLados("completa", ["B"]), null);
  assert.deepEqual(asignarLados("media", ["A", "B"]), ["A"]);
  assert.deepEqual(asignarLados("media", ["A", "B"], "B"), ["B"]);
  assert.deepEqual(asignarLados("media", ["B"], "A"), ["B"]);
  assert.equal(asignarLados("media", []), null);
  assert.equal(asignarLados("otra", ["A", "B"]), null);
});

test("solo horas en punto", () => {
  assert.match(validarTurno(CONFIG, "2026-11-24", "19:30", { ahora: AHORA }), /en punto/);
  assert.match(validarTurno(CONFIG, "2026-11-24", "22:30", { ahora: AHORA }), /en punto/);
});

test("fuera del horario", () => {
  assert.match(validarTurno(CONFIG, "2026-11-24", "23:00", { ahora: AHORA }), /horario/);
  assert.match(validarTurno(CONFIG, "2026-11-24", "18:00", { ahora: AHORA }), /horario/);
  assert.match(validarTurno(CONFIG, "2026-11-28", "20:00", { ahora: AHORA }), /horario/);
});

test("día cerrado", () => {
  assert.match(validarTurno(CONFIG, "2026-12-25", "20:00", { ahora: AHORA }), /cerrado: Navidad/);
});

test("hora válida", () => {
  assert.equal(validarTurno(CONFIG, "2026-11-24", "22:00", { ahora: AHORA }), null);
});

test("hora pasada (también desde el panel)", () => {
  const tarde = new Date("2026-11-24T00:30:00Z"); // lunes 21:30 Chile
  assert.match(validarTurno(CONFIG, "2026-11-23", "21:00", { ahora: tarde }), /ya pasó/);
  assert.match(validarTurno(CONFIG, "2026-11-23", "21:00", { ahora: tarde, panel: true }), /ya pasó/);
});

test("anticipación mínima solo para la web", () => {
  const casi = new Date("2026-11-23T21:30:00Z"); // lunes 18:30 Chile
  assert.match(validarTurno(CONFIG, "2026-11-23", "19:00", { ahora: casi }), /anticipación/);
  assert.equal(validarTurno(CONFIG, "2026-11-23", "19:00", { ahora: casi, panel: true }), null);
});

test("máximo de días hacia adelante", () => {
  assert.match(validarTurno(CONFIG, "2027-01-04", "20:00", { ahora: AHORA }), /30 días/);
  assert.equal(validarTurno(CONFIG, "2027-01-04", "20:00", { ahora: AHORA, panel: true }), null);
});

test("precios y abono opcional", () => {
  assert.equal(precioDe(CONFIG, "completa"), 70000);
  assert.equal(precioDe(CONFIG, "media"), 35000);
  assert.equal(abonoDe(CONFIG, 70000), 0);
  assert.equal(abonoDe({ abono: { activo: true, porcentaje: 30 } }, 70000), 21000);
});

test("cancelación web hasta N horas antes", () => {
  const r = { fecha: "2026-11-24", hora: "20:00", estado: "confirmada" };
  assert.equal(puedeCancelarWeb(CONFIG, r, AHORA).ok, true);
  assert.equal(puedeCancelarWeb(CONFIG, r, new Date("2026-11-24T15:00:00Z")).ok, false);
  assert.equal(puedeCancelarWeb(CONFIG, { ...r, estado: "completada" }, AHORA).ok, false);
  assert.equal(puedeCancelarWeb({ cancelacion: { permitidaWeb: false } }, r, AHORA).ok, false);
});

test("transiciones de estado", () => {
  assert.equal(puedeTransicionar("pendiente", "confirmada"), true);
  assert.equal(puedeTransicionar("confirmada", "completada"), true);
  assert.equal(puedeTransicionar("no_asistio", "completada"), true);
  assert.equal(puedeTransicionar("cancelada", "confirmada"), false);
  assert.equal(puedeTransicionar("completada", "cancelada"), false);
});

test("capacidad de noviembre 2026: 21 días hábiles × 4 horas × 2 mitades", () => {
  assert.equal(capacidadDelMes(CONFIG, 2026, 10), 21 * 4 * 2);
});

test("resumen del mes", () => {
  const cli = (n) => ({ nombre: n, telefono: "9" + n.length, telefonoNormalizado: n });
  const reservas = [
    { fecha: "2026-11-02", hora: "20:00", tipo: "completa", lados: ["A", "B"], estado: "completada", precio: 70000, pago: { montoPagado: 70000 }, cliente: cli("Los Cracks") },
    { fecha: "2026-11-09", hora: "20:00", tipo: "completa", lados: ["A", "B"], estado: "completada", precio: 70000, pago: { montoPagado: 0 }, cliente: cli("Los Cracks") },
    { fecha: "2026-11-03", hora: "21:00", tipo: "media", lados: ["A"], estado: "confirmada", precio: 35000, pago: { montoPagado: 17500 }, cliente: cli("FC Oficina") },
    { fecha: "2026-11-04", hora: "19:00", tipo: "media", lados: ["B"], estado: "cancelada", precio: 35000, pago: { montoPagado: 0 }, cliente: cli("X") },
    { fecha: "2026-11-05", hora: "19:00", tipo: "media", lados: ["B"], estado: "no_asistio", precio: 35000, pago: { montoPagado: 0 }, cliente: cli("Y") },
  ];
  const r = resumenDelMes(reservas, CONFIG, 2026, 10);
  assert.equal(r.arriendos, 3);
  assert.equal(r.completas, 2);
  assert.equal(r.medias, 1);
  assert.equal(r.ingresos, 175000);
  assert.equal(r.cobrado, 87500);
  assert.equal(r.porCobrar, 87500);
  assert.equal(r.canceladas, 1);
  assert.equal(r.noAsistio, 1);
  assert.equal(r.mitadesVendidas, 5);
  assert.equal(r.ocupacion, Math.round((5 / 168) * 100));
  assert.equal(r.clientesFrecuentes[0].arriendos, 2);
  assert.deepEqual(r.porHora, [{ hora: "20:00", cantidad: 2 }, { hora: "21:00", cantidad: 1 }]);
  assert.deepEqual(r.calor.find((c) => c.dia === 1 && c.hora === "20:00"), { dia: 1, hora: "20:00", cantidad: 2 });
});

test("lista de espera: qué le sirve a cada uno cuando se libera", async () => {
  const { esperaCabe, puedeAnotarseEnEspera } = await import("../src/services/canchas/reglas.js");
  const llena = estadoHora([{ lados: ["A", "B"], estado: "confirmada", activa: true }]);
  const media = estadoHora([{ lados: ["A"], estado: "confirmada", activa: true }]);
  const libre = estadoHora([]);
  // Hora llena: cualquiera se puede anotar
  assert.equal(puedeAnotarseEnEspera("completa", llena), true);
  assert.equal(puedeAnotarseEnEspera("media", llena), true);
  assert.equal(puedeAnotarseEnEspera("cualquiera", llena), true);
  // Queda media: solo tiene sentido esperar la completa
  assert.equal(puedeAnotarseEnEspera("completa", media), true);
  assert.equal(puedeAnotarseEnEspera("media", media), false);
  assert.equal(puedeAnotarseEnEspera("cualquiera", media), false);
  // Se libera media cancha: le sirve al que esperaba media o cualquiera, no al de la completa
  assert.equal(esperaCabe("media", media), true);
  assert.equal(esperaCabe("cualquiera", media), true);
  assert.equal(esperaCabe("completa", media), false);
  // Se libera toda: le sirve a todos
  assert.equal(esperaCabe("completa", libre), true);
});
