import CupoMembresiaClaseModel from "../models/cupoMembresiaClase.model.js";
import InscripcionClaseModel from "../models/inscripcionClase.model.js";
import { obtenerRangoConteo } from "./contarClasesUsadasMembresia.js";

// Reserva atómica de UNA clase dentro del cupo de una mensualidad
// (MembresiaClase), para el ciclo al que pertenece fechaSesion. Reemplaza el
// patrón anterior "contarClasesUsadasMembresia(membresia) y luego comparar
// contra clasesIncluidas", que tenía dos problemas:
//
// 1) Condición de carrera (TOCTOU): dos solicitudes simultáneas del mismo
//    cliente podían contar ambas "me quedan clases" antes de que la primera
//    alcanzara a crear su InscripcionClase, dejando al cliente con más
//    clases usadas que las incluidas en su plan.
// 2) El conteo se hacía contra "ahora" en vez de contra la fecha de la
//    sesión que se está reservando, así que reservar con anticipación una
//    clase de un ciclo futuro (tipoCiclo "mensual") se evaluaba contra el
//    ciclo actual en vez del ciclo real de esa sesión.
//
// Esta función corrige ambos: usa fechaSesion (no "ahora") para determinar
// el ciclo vigente, y reserva el cupo con un $inc condicionado atómico,
// igual que reservarCupoAtomico en cupoSesionHelper.js. Devuelve true si
// logró reservar el cupo (queda una clase menos disponible), false si el
// cliente ya usó todas las clases de ese ciclo.
export const reservarClaseMembresiaAtomico = async (membresia, fechaSesion) => {
  const { desde } = obtenerRangoConteo(membresia, fechaSesion);
  const cicloClave = desde.toISOString();
  const cupoEfectivo = membresia.clasesIncluidas;

  // Camino normal: el contador de este ciclo ya existe.
  const directo = await CupoMembresiaClaseModel.findOneAndUpdate(
    { membresia: membresia._id, cicloClave, reservados: { $lt: cupoEfectivo } },
    { $inc: { reservados: 1 } },
    { new: true },
  );
  if (directo) return true;

  // Puede ser que el cupo del ciclo esté lleno, O que todavía no exista el
  // contador para este ciclo (primera reserva desde que se agregó este
  // mecanismo, o primera reserva de este ciclo). Distinguimos ambos casos.
  const contador = await CupoMembresiaClaseModel.findOne({
    membresia: membresia._id,
    cicloClave,
  });
  if (contador) return false; // sí existe y está lleno: no quedan clases, punto.

  // No existe todavía: lo sembramos con el conteo REAL actual de ese ciclo
  // (por si ya había inscripciones creadas antes de este cambio, o hechas
  // por el mecanismo antiguo) para no perder de vista clases ya usadas.
  const { desde: desdeReal, hasta: hastaReal } = obtenerRangoConteo(membresia, fechaSesion);
  const usadasReal = await InscripcionClaseModel.countDocuments({
    empresa: membresia.empresa,
    cliente: membresia.cliente,
    tipoAcceso: "membresia",
    estado: { $ne: "cancelada" },
    fecha: { $gte: desdeReal, $lte: hastaReal },
  });

  try {
    await CupoMembresiaClaseModel.create({
      membresia: membresia._id,
      cicloClave,
      reservados: usadasReal,
    });
  } catch (error) {
    // Carrera: otra petición sembró el contador un instante antes que
    // nosotros — no pasa nada, seguimos abajo con el reintento atómico.
    if (error?.code !== 11000) throw error;
  }

  // Reintento: ahora el documento seguro existe (recién creado por nosotros
  // o por quien ganó la carrera de arriba), así que el incremento
  // condicionado de abajo es atómico y seguro.
  const reintento = await CupoMembresiaClaseModel.findOneAndUpdate(
    { membresia: membresia._id, cicloClave, reservados: { $lt: cupoEfectivo } },
    { $inc: { reservados: 1 } },
    { new: true },
  );
  return !!reintento;
};

// Libera una clase reservada del cupo de la mensualidad (cancelación, o
// compensación de un fallo posterior a la reserva). Nunca baja de 0. Recibe
// fechaSesion para recalcular el mismo cicloClave que se usó al reservar.
export const liberarClaseMembresiaAtomico = async (membresia, fechaSesion) => {
  const { desde } = obtenerRangoConteo(membresia, fechaSesion);
  const cicloClave = desde.toISOString();

  await CupoMembresiaClaseModel.updateOne(
    { membresia: membresia._id, cicloClave, reservados: { $gt: 0 } },
    { $inc: { reservados: -1 } },
  );
};
