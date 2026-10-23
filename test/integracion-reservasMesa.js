// Prueba de integración del módulo de reservas de mesa contra una base REAL
// de prueba (crea y borra sus propios datos). Revisa lo que las pruebas
// puras no pueden: que dos reservas simultáneas no sobrevendan un sector,
// que editar y cancelar devuelvan el cupo, y que el recálculo cuadre.
//
// SEGURIDAD: solo corre si MONGO_URI_TEST apunta a una base cuyo nombre
// contiene "test". Nunca usa MONGO_URI (producción).
//
//   MONGO_URI_TEST="mongodb+srv://.../agenda_test" node test/integracion-reservasMesa.js

import mongoose from "mongoose";
import assert from "node:assert/strict";
import ReservaMesa from "../src/models/reservaMesa.model.js";
import OcupacionFranjaMesa from "../src/models/ocupacionFranjaMesa.model.js";
import BloqueoReservaMesa from "../src/models/bloqueoReservaMesa.model.js";
import { crearReserva, editarReserva, cambiarEstadoReserva } from "../src/services/reservasMesa/reservas.js";
import { recalcularOcupacion } from "../src/services/reservasMesa/ocupacion.js";
import { sumarDias, hoyChile, diaSemana } from "../src/services/reservasMesa/tiempo.js";

const uri = process.env.MONGO_URI_TEST;
if (!uri) {
  console.error("Falta MONGO_URI_TEST (una base de PRUEBA).");
  process.exit(1);
}

const empresaId = new mongoose.Types.ObjectId();
const TERRAZA = new mongoose.Types.ObjectId();
const fecha = sumarDias(hoyChile(), 3);

const config = {
  sectores: [{ _id: TERRAZA, nombre: "Terraza", capacidad: 10, activo: true, reservableOnline: true }],
  horario: [{ dia: diaSemana(fecha), abierto: true, desde: "19:00", hasta: "22:00" }],
  intervaloMinutos: 30,
  duracionMinutos: 120,
  anticipacionMinimaMinutos: 0,
  anticipacionMaximaDias: 30,
  maxPersonasPorReserva: 20,
  maxPersonasWeb: 8,
  toleranciaMinutos: 15,
  reservasWebActivas: true,
  confirmacionAutomaticaWeb: true,
  permisosPersonal: { cancelar: true, forzarSobrecupo: false },
};
const actor = { id: null, nombre: "prueba" };
const entrada = (i, extra = {}) => ({
  nombre: `Cliente ${i}`,
  telefono: `+56 9 0000 ${String(1000 + i)}`,
  fecha,
  hora: "20:00",
  personas: 2,
  sectorId: String(TERRAZA),
  ...extra,
});

const main = async () => {
  await mongoose.connect(uri);
  const nombreBase = mongoose.connection.db.databaseName;
  if (!/test/i.test(nombreBase)) {
    console.error(`La base "${nombreBase}" no parece de prueba (su nombre debe contener "test"). Abortando.`);
    process.exit(1);
  }
  await Promise.all([ReservaMesa.syncIndexes(), OcupacionFranjaMesa.syncIndexes()]);

  try {
    // 1) 12 reservas simultáneas de 2 personas en un sector de 10 → solo 5 entran
    const resultados = await Promise.all(
      Array.from({ length: 12 }, (_, i) => crearReserva({ empresaId, config, entrada: entrada(i), actor })),
    );
    const ok = resultados.filter((r) => r.ok);
    assert.equal(ok.length, 5, `entraron ${ok.length} reservas, se esperaban 5`);
    assert.ok(resultados.filter((r) => !r.ok).every((r) => r.codigo === "SIN_CUPO"));
    console.log("✔ concurrencia: 5 de 12 reservas simultáneas (capacidad 10, grupos de 2)");

    // 2) Sin cupo propone alternativas (19:00 termina 21:00 y no hay nada antes)
    const sinCupo = resultados.find((r) => !r.ok);
    assert.ok(Array.isArray(sinCupo.alternativas));
    console.log("✔ sin cupo trae alternativas:", sinCupo.alternativas.map((a) => a.hora).join(", ") || "(ninguna)");

    // 3) Cancelar libera el cupo → ahora entra una más
    const primera = await ReservaMesa.findById(ok[0].reserva._id);
    const cancel = await cambiarEstadoReserva({ reserva: primera, hacia: "cancelada", motivo: "cliente_cancelo", actor });
    assert.equal(cancel.ok, true);
    const otra = await crearReserva({ empresaId, config, entrada: entrada(50), actor });
    assert.equal(otra.ok, true);
    console.log("✔ cancelar devuelve el cupo");

    // 4) Editar a más personas sin cupo falla y deja todo como estaba
    const segunda = await ReservaMesa.findById(ok[1].reserva._id);
    const edit = await editarReserva({ empresaId, config, reserva: segunda, entrada: { personas: 4 }, actor });
    assert.equal(edit.ok, false);
    assert.equal(edit.codigo, "SIN_CUPO");
    const recheck = await ReservaMesa.findById(segunda._id);
    assert.equal(recheck.personas, 2);
    console.log("✔ edición sin cupo se rechaza y no pierde el lugar original");

    // 5) Mover a las 22:00 (sin choque) sí funciona y queda en el historial
    const mover = await editarReserva({ empresaId, config, reserva: recheck, entrada: { hora: "22:00" }, actor });
    assert.equal(mover.ok, true);
    assert.ok(mover.reserva.historial.some((h) => h.accion === "editada"));
    console.log("✔ mover de hora funciona y queda en el historial");

    // 6) Duplicado del mismo teléfono en la web se rechaza
    const dup = await crearReserva({
      empresaId,
      config,
      entrada: entrada(50, { hora: "21:00", email: "a@b.cl" }),
      canal: "web",
      actor: null,
    });
    assert.equal(dup.ok, false);
    assert.equal(dup.codigo, "DUPLICADA");
    console.log("✔ duplicado web rechazado");

    // 7) Idempotencia: misma clave = misma reserva
    const a = await crearReserva({ empresaId, config, entrada: entrada(70, { hora: "19:00", claveIdempotencia: "k-1" }), actor });
    const b = await crearReserva({ empresaId, config, entrada: entrada(70, { hora: "19:00", claveIdempotencia: "k-1" }), actor });
    assert.equal(String(a.reserva._id), String(b.reserva._id));
    assert.equal(b.repetida, true);
    console.log("✔ idempotencia");

    // 8) Los contadores cuadran con un recálculo desde cero
    const antes = await OcupacionFranjaMesa.find({ empresa: empresaId, personas: { $gt: 0 } }).sort({ sector: 1, franja: 1 }).lean();
    await recalcularOcupacion(empresaId, { desde: new Date(0) });
    const despues = await OcupacionFranjaMesa.find({ empresa: empresaId, personas: { $gt: 0 } }).sort({ sector: 1, franja: 1 }).lean();
    assert.deepEqual(
      despues.map((d) => [String(d.franja.toISOString()), d.personas]),
      antes.map((d) => [String(d.franja.toISOString()), d.personas]),
    );
    console.log("✔ contadores coinciden con el recálculo");

    console.log("\nTodo OK");
  } finally {
    await Promise.all([
      ReservaMesa.deleteMany({ empresa: empresaId }),
      OcupacionFranjaMesa.deleteMany({ empresa: empresaId }),
      BloqueoReservaMesa.deleteMany({ empresa: empresaId }),
    ]);
    await mongoose.disconnect();
  }
};

main().catch((e) => {
  console.error("✘ Falló:", e);
  process.exit(1);
});
