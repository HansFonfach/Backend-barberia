import InscripcionClase from "../models/inscripcionClase.model.js";

const DIA_MS = 24 * 60 * 60 * 1000;
const CICLO_DIAS = 30;

// Para tipoCiclo "mensual": la mensualidad dura duracionDias EN TOTAL (ej.
// 180 días = 6 meses), pero el cupo (clasesIncluidas) se resetea cada 30
// días desde fechaInicio, en vez de contarse una sola vez para todo el
// período. Se calcula en qué ciclo de 30 días cae "ahora" y se devuelve solo
// ese rango (recortado a fechaFin si el último ciclo queda más corto que 30
// días). Para tipoCiclo "total" (o cuando no está seteado, planes/mensualidades
// de antes de este campo) se devuelve el rango completo, igual que siempre.
const obtenerRangoConteo = (membresia) => {
  if (membresia.tipoCiclo !== "mensual") {
    return { desde: membresia.fechaInicio, hasta: membresia.fechaFin };
  }

  const ahoraMs = Date.now();
  const inicioMs = membresia.fechaInicio.getTime();
  const finMs = membresia.fechaFin.getTime();

  const transcurridoMs = Math.max(0, Math.min(ahoraMs, finMs) - inicioMs);
  const indiceCiclo = Math.floor(transcurridoMs / (CICLO_DIAS * DIA_MS));
  const desdeMs = inicioMs + indiceCiclo * CICLO_DIAS * DIA_MS;
  const hastaMs = Math.min(desdeMs + CICLO_DIAS * DIA_MS, finMs);

  return { desde: new Date(desdeMs), hasta: new Date(hastaMs) };
};

// Cuenta en tiempo real cuántas clases ya usó un cliente dentro del ciclo de
// su mensualidad (no se guarda un contador aparte, para que una inscripción
// cancelada libere el cupo automáticamente, igual como ya hace el sistema
// de suscripciones de la barbería con sus reservas).
export const contarClasesUsadasMembresia = async (membresia) => {
  const { desde, hasta } = obtenerRangoConteo(membresia);

  return InscripcionClase.countDocuments({
    empresa: membresia.empresa,
    cliente: membresia.cliente,
    tipoAcceso: "membresia",
    estado: { $ne: "cancelada" },
    fecha: { $gte: desde, $lte: hasta },
  });
};
