import CupoSesionModel from "../models/cupoSesion.model.js";
import InscripcionClaseModel from "../models/inscripcionClase.model.js";

// Reserva atómica de un cupo para una sesión puntual (clase+fecha). En vez de
// "contar inscritos y luego crear" (lo que ya hacía el sistema y es una
// condición de carrera real bajo solicitudes simultáneas), se mantiene un
// contador propio que solo se incrementa si sigue bajo el cupo vigente, en
// una única operación atómica de Mongo ($inc condicionado con $lt). Devuelve
// true si logró reservar el cupo, false si ya no quedaba disponible.
export const reservarCupoAtomico = async (claseId, fecha, cupoEfectivo) => {
  // Camino normal: el contador de esta sesión ya existe.
  const directo = await CupoSesionModel.findOneAndUpdate(
    { clase: claseId, fecha, reservados: { $lt: cupoEfectivo } },
    { $inc: { reservados: 1 } },
    { new: true },
  );
  if (directo) return true;

  // Puede ser que el cupo esté lleno, O que todavía no exista el contador
  // para esta sesión (primera reserva desde que se agregó este mecanismo, o
  // primera reserva de la sesión). Distinguimos ambos casos.
  const contador = await CupoSesionModel.findOne({ clase: claseId, fecha });
  if (contador) return false; // sí existe y está lleno: no hay cupo, punto.

  // No existe todavía: lo sembramos con el conteo REAL actual (por si ya
  // había inscripciones creadas antes de este cambio) para no perder de
  // vista cupos ya ocupados.
  const ocupadosReal = await InscripcionClaseModel.countDocuments({
    clase: claseId,
    fecha,
    estado: "confirmada",
  });

  try {
    await CupoSesionModel.create({ clase: claseId, fecha, reservados: ocupadosReal });
  } catch (error) {
    // Carrera: otra petición sembró el contador un instante antes que
    // nosotros — no pasa nada, seguimos abajo con el reintento atómico.
    if (error?.code !== 11000) throw error;
  }

  // Reintento: ahora el documento seguro existe (recién creado por nosotros
  // o por quien ganó la carrera de arriba), así que el incremento
  // condicionado de abajo es atómico y seguro.
  const reintento = await CupoSesionModel.findOneAndUpdate(
    { clase: claseId, fecha, reservados: { $lt: cupoEfectivo } },
    { $inc: { reservados: 1 } },
    { new: true },
  );
  return !!reintento;
};

// Libera un cupo reservado (cancelación, o compensación de un fallo posterior
// a la reserva). Nunca baja de 0.
export const liberarCupoAtomico = async (claseId, fecha) => {
  await CupoSesionModel.updateOne(
    { clase: claseId, fecha, reservados: { $gt: 0 } },
    { $inc: { reservados: -1 } },
  );
};
