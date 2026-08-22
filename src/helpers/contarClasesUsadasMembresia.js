import InscripcionClase from "../models/inscripcionClase.model.js";

// Cuenta en tiempo real cuántas clases ya usó un cliente dentro del ciclo de
// su mensualidad (no se guarda un contador aparte, para que una inscripción
// cancelada libere el cupo automáticamente, igual como ya hace el sistema
// de suscripciones de la barbería con sus reservas).
export const contarClasesUsadasMembresia = async (membresia) => {
  return InscripcionClase.countDocuments({
    empresa: membresia.empresa,
    cliente: membresia.cliente,
    tipoAcceso: "membresia",
    estado: { $ne: "cancelada" },
    fecha: { $gte: membresia.fechaInicio, $lte: membresia.fechaFin },
  });
};
