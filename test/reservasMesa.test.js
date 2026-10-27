// Pruebas de la lógica pura del módulo de reservas de mesa.
// Correr con:  node --test test/
// Los valores de configuración de acá son SOLO de prueba, no del local.
import { test } from "node:test";
import assert from "node:assert/strict";

import { franjasEntre, instante, diaSemana } from "../src/services/reservasMesa/tiempo.js";
import {
  faltantesConfiguracion,
  horasDeLlegada,
  validarSolicitud,
  bloqueoQueAplica,
  mensajeBloqueo,
  diasEspecialesPublicos,
} from "../src/services/reservasMesa/reglas.js";
import { calcularDisponibilidad, buscarAlternativas, cupoLibre } from "../src/services/reservasMesa/disponibilidad.js";
import { validarCambioEstado, puedeTransicionar, ocupaCupo } from "../src/services/reservasMesa/transiciones.js";
import { normalizarTelefono, generarCodigo, diferencias } from "../src/services/reservasMesa/utilidades.js";

const TERRAZA = "64b000000000000000000001";
const SALON = "64b000000000000000000002";

const config = (extra = {}) => ({
  sectores: [
    { _id: TERRAZA, nombre: "Terraza", capacidad: 10, activo: true, reservableOnline: true },
    { _id: SALON, nombre: "Salón", capacidad: 20, activo: true, reservableOnline: false },
  ],
  horario: [{ dia: 5, abierto: true, desde: "19:00", hasta: "22:00" }], // viernes
  intervaloMinutos: 30,
  duracionMinutos: 120,
  anticipacionMinimaMinutos: 60,
  anticipacionMaximaDias: 30,
  maxPersonasPorReserva: 15,
  maxPersonasWeb: 8,
  toleranciaMinutos: 15,
  reservasWebActivas: true,
  ...extra,
});

const VIERNES = "2026-10-23";
const AHORA = new Date("2026-10-21T15:00:00Z"); // miércoles

test("diaSemana usa el día de Chile", () => {
  assert.equal(diaSemana(VIERNES), 5);
});

test("franjas de 15 minutos de una reserva de 2 horas", () => {
  const ini = instante(VIERNES, "20:00").toDate();
  const fin = instante(VIERNES, "22:00").toDate();
  const f = franjasEntre(ini, fin);
  assert.equal(f.length, 8);
  assert.equal(f[0].getTime(), ini.getTime());
});

test("franjas que cruzan medianoche siguen siendo contiguas", () => {
  const ini = instante(VIERNES, "23:00").toDate();
  const f = franjasEntre(ini, new Date(ini.getTime() + 120 * 60000));
  assert.equal(f.length, 8);
  assert.equal(f[7].getTime() - f[0].getTime(), 105 * 60000);
});

test("faltantes de configuración", () => {
  assert.ok(faltantesConfiguracion(null).length > 0);
  assert.deepEqual(faltantesConfiguracion(config()), []);
  assert.ok(faltantesConfiguracion(config({ duracionMinutos: null })).includes("Duración de la reserva"));
  assert.ok(faltantesConfiguracion(config({ reservasWebActivas: false }), "web").length > 0);
});

test("horas de llegada según horario e intervalo", () => {
  assert.deepEqual(horasDeLlegada(config(), VIERNES), ["19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"]);
  assert.deepEqual(horasDeLlegada(config(), "2026-10-22"), []); // jueves cerrado
});

test("validarSolicitud: caso válido en el panel", () => {
  const v = validarSolicitud({ config: config(), fecha: VIERNES, hora: "20:00", personas: 4, sectorId: TERRAZA, ahora: AHORA });
  assert.equal(v.ok, true);
  assert.equal(v.franjas.length, 8);
  assert.equal(v.sector.nombre, "Terraza");
});

test("validarSolicitud: rechazos", () => {
  const base = { config: config(), fecha: VIERNES, hora: "20:00", personas: 4, sectorId: TERRAZA, ahora: AHORA };
  assert.equal(validarSolicitud({ ...base, hora: "20:15" }).codigo, "HORA_FUERA_DE_HORARIO");
  assert.equal(validarSolicitud({ ...base, fecha: "2026-10-22" }).codigo, "DIA_CERRADO");
  assert.equal(validarSolicitud({ ...base, personas: 16 }).codigo, "GRUPO_GRANDE");
  assert.equal(validarSolicitud({ ...base, personas: 9, canal: "web" }).codigo, "GRUPO_GRANDE");
  assert.equal(validarSolicitud({ ...base, personas: 11 }).codigo, "SIN_CUPO"); // más que la capacidad de terraza
  assert.equal(validarSolicitud({ ...base, sectorId: SALON, canal: "web" }).codigo, "SECTOR_INVALIDO");
  assert.equal(validarSolicitud({ ...base, fecha: "2026-10-16" }).codigo, "EN_PASADO");
  assert.equal(validarSolicitud({ ...base, fecha: "2026-12-25", canal: "web" }).codigo, "MUY_LEJOS");
  assert.equal(
    validarSolicitud({ ...base, bloqueos: [{ fecha: VIERNES, sector: TERRAZA, motivo: "Lluvia" }] }).codigo,
    "BLOQUEADO",
  );
});

test("validarSolicitud: anticipación mínima solo en la web", () => {
  const ahora = instante(VIERNES, "19:30").toDate();
  const base = { config: config(), fecha: VIERNES, hora: "20:00", personas: 2, sectorId: TERRAZA, ahora };
  assert.equal(validarSolicitud({ ...base, canal: "web" }).codigo, "MUY_PRONTO");
  assert.equal(validarSolicitud(base).ok, true);
});

test("validarSolicitud: mantieneHorario permite editar una reserva en curso", () => {
  const ahora = instante(VIERNES, "21:00").toDate();
  const base = { config: config(), fecha: VIERNES, hora: "20:00", personas: 5, sectorId: TERRAZA, ahora };
  assert.equal(validarSolicitud(base).codigo, "EN_PASADO");
  assert.equal(validarSolicitud({ ...base, mantieneHorario: true }).ok, true);
});

test("bloqueo por tramo de horas", () => {
  const b = [{ fecha: VIERNES, sector: null, horaDesde: "21:00", horaHasta: "22:00", motivo: "Evento" }];
  assert.equal(bloqueoQueAplica(b, { fecha: VIERNES, hora: "20:30", sectorId: TERRAZA }), null);
  assert.ok(bloqueoQueAplica(b, { fecha: VIERNES, hora: "21:30", sectorId: SALON }));
});

test("día solo por orden de llegada: bloquea web y panel con un mensaje claro", () => {
  const bloqueos = [{ fecha: VIERNES, sector: null, tipo: "orden_llegada", motivo: "Día de la Madre" }];
  const base = { config: config(), fecha: VIERNES, hora: "20:00", personas: 2, sectorId: TERRAZA, ahora: AHORA, bloqueos };
  const web = validarSolicitud({ ...base, canal: "web" });
  assert.equal(web.codigo, "BLOQUEADO");
  assert.equal(web.mensaje, "Día de la Madre: ese día atendemos solo por orden de llegada, sin reservas.");
  assert.equal(validarSolicitud(base).codigo, "BLOQUEADO");
  // Bloqueos antiguos (sin tipo) mantienen su mensaje de siempre
  assert.equal(mensajeBloqueo({ motivo: "Lluvia" }), "No se reciben reservas en ese horario: Lluvia");
  assert.equal(
    mensajeBloqueo({ tipo: "orden_llegada", horaDesde: "20:00", horaHasta: "23:00", motivo: "" }),
    "Entre las 20:00 y las 23:00 atendemos solo por orden de llegada, sin reservas.",
  );
  assert.equal(
    mensajeBloqueo({ tipo: "orden_llegada", horaDesde: "20:00", horaHasta: "23:59", motivo: "Día de la Mujer" }),
    "Día de la Mujer: desde las 20:00 atendemos solo por orden de llegada, sin reservas.",
  );
});

test("días especiales públicos: solo los de todo el local, ordenados", () => {
  const lista = diasEspecialesPublicos([
    { fecha: "2026-05-09", sector: null, tipo: "orden_llegada", motivo: "Día de la Madre" },
    { fecha: "2026-03-07", sector: null, tipo: "orden_llegada", horaDesde: "20:00", horaHasta: "23:00" },
    { fecha: "2026-03-01", sector: TERRAZA, motivo: "Lluvia" }, // un sector: no se anuncia
    { fecha: "2026-03-02", sector: null, horaDesde: "18:00", horaHasta: "20:00", motivo: "Evento" }, // tramo sin reservas: no
    { fecha: "2026-03-03", sector: null }, // día completo sin reservas: sí
  ]);
  assert.deepEqual(lista.map((d) => d.fecha), ["2026-03-03", "2026-03-07", "2026-05-09"]);
  assert.equal(lista[0].mensaje, "Ese día no recibimos reservas.");
  assert.equal(lista[1].diaCompleto, false);
  assert.equal(lista[2].tipo, "orden_llegada");
});

test("disponibilidad: el peor tramo manda y se puede descontar la propia reserva", () => {
  const ini = instante(VIERNES, "21:00").toDate();
  const ocupadas = franjasEntre(ini, new Date(ini.getTime() + 120 * 60000));
  const ocupacion = new Map(ocupadas.map((f) => [`${TERRAZA}|${f.toISOString()}`, 8]));

  const disp = calcularDisponibilidad({ config: config(), fecha: VIERNES, personas: 4, ocupacion, ahora: AHORA });
  const terraza = (hora) => disp.find((d) => d.hora === hora).sectores.find((s) => s.id === TERRAZA);

  assert.equal(terraza("19:00").libre, 10); // termina a las 21:00, no se cruza
  assert.equal(terraza("20:00").libre, 2); // se cruza 20:00-22:00 con 21:00-23:00
  assert.equal(terraza("20:00").disponible, false);

  const alt = buscarAlternativas(disp, { hora: "20:00", sectorId: TERRAZA });
  assert.deepEqual(alt[0], { hora: "20:00", sectorId: SALON, sector: "Salón" });
  assert.ok(alt.some((a) => a.hora === "19:00" && a.sectorId === TERRAZA));

  const libre = cupoLibre({
    capacidad: 10,
    sectorId: TERRAZA,
    franjas: ocupadas,
    ocupacion,
    descontar: { sectorId: TERRAZA, franjas: ocupadas, personas: 8 },
  });
  assert.equal(libre, 10);
});

test("disponibilidad web: solo sectores reservables y horas con anticipación", () => {
  const ahora = instante(VIERNES, "19:45").toDate();
  const disp = calcularDisponibilidad({ config: config(), fecha: VIERNES, canal: "web", ahora });
  assert.equal(disp[0].hora, "21:00");
  assert.ok(disp.every((d) => d.sectores.length === 1 && d.sectores[0].id === TERRAZA));
});

test("transiciones de estado", () => {
  assert.equal(puedeTransicionar("confirmada", "llego"), true);
  assert.equal(puedeTransicionar("cancelada", "llego"), false);
  assert.equal(ocupaCupo("llego"), true);
  assert.equal(ocupaCupo("completada"), false);

  const r = { estado: "confirmada", fecha: VIERNES };
  assert.equal(validarCambioEstado({ reserva: r, hacia: "cancelada", motivo: "", hoy: VIERNES }).ok, false);
  assert.equal(validarCambioEstado({ reserva: r, hacia: "cancelada", motivo: "cliente_cancelo", hoy: VIERNES }).ok, true);

  const na = { estado: "no_asistio", fecha: VIERNES };
  assert.equal(validarCambioEstado({ reserva: na, hacia: "llego", motivo: "Llegó tarde", hoy: VIERNES }).ok, true);
  assert.equal(validarCambioEstado({ reserva: na, hacia: "llego", motivo: "Llegó tarde", hoy: "2026-10-24" }).ok, false);
});

test("utilidades", () => {
  assert.equal(normalizarTelefono("+56 9 1234 5678"), "912345678");
  assert.equal(normalizarTelefono("912345678"), "912345678");
  assert.match(generarCodigo(), /^[A-HJ-NP-Z2-9]{6}$/);
  assert.deepEqual(diferencias({ a: 1, b: 2 }, { a: 1, b: 3 }, ["a", "b"]), { b: [2, 3] });
  assert.equal(diferencias({ a: 1 }, { a: 1 }, ["a"]), null);
});

test("WhatsApp: plantillas con los parámetros y botones esperados", async () => {
  const { whatsappConfirmacionAsistencia, whatsappAvisoLocal, cuandoEs, formatearTelefono } = await import(
    "../src/services/reservasMesa/whatsapp.js"
  );
  const enviados = [];
  const fetchOriginal = globalThis.fetch;
  process.env.ACCESS_TOKEN ||= "token-de-prueba";
  process.env.PHONE_NUMBER ||= "123";
  globalThis.fetch = async (url, opciones) => {
    enviados.push(JSON.parse(opciones.body));
    return { ok: true, json: async () => ({}) };
  };
  try {
    const reserva = {
      fecha: VIERNES, hora: "21:00", personas: 4, estado: "pendiente",
      sector: { nombre: "Salón" }, cumpleanos: { es: true },
      cliente: { nombre: "Camila Rojas", telefono: "+56 9 1234 5678" },
    };
    const empresa = { nombre: "Santa Fe", direccion: "Calle Falsa 123, Ovalle" };
    const r = await whatsappConfirmacionAsistencia(reserva, empresa, "abc123", instante(VIERNES, "18:00").toDate(), "+56 9 1111 2222");
    assert.equal(r.ok, true);
    const [m1] = enviados;
    assert.equal(m1.to, "56912345678");
    assert.equal(m1.template.name, "recordatorio_reserva_mesa");
    assert.deepEqual(m1.template.components[0].parameters.map((p) => p.text), ["Camila", "Santa Fe", "hoy a las 21:00", "4", "Salón", "Calle Falsa 123, Ovalle", "+56 9 1111 2222"]);
    assert.equal(m1.template.components.filter((c) => c.type === "button").length, 2);

    await whatsappAvisoLocal(reserva, { ...empresa, slug: "santafe" }, ["912345678", "+56 9 8765 4321"]);
    assert.equal(enviados.length, 3);
    assert.equal(enviados[1].template.name, "nueva_reserva_mesa");
    assert.equal(enviados[1].template.components[0].parameters[1].text, "Camila Rojas (cumpleaños)");
    assert.equal(enviados[2].to, "56987654321");
    assert.equal(enviados[1].template.components[1].parameters[0].text, `santafe/admin/reservas-mesa-hoy?fecha=${VIERNES}`);

    assert.equal(cuandoEs({ fecha: VIERNES, hora: "21:00" }, instante("2026-10-22", "12:00").toDate()), "mañana a las 21:00");
    assert.equal(formatearTelefono("9 1234 5678"), "56912345678");
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});
