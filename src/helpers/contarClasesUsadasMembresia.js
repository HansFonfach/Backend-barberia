import InscripcionClase from "../models/inscripcionClase.model.js";

const DIA_MS = 24 * 60 * 60 * 1000;
const CICLO_DIAS = 30;

// Para tipoCiclo "mensual": la mensualidad dura duracionDias EN TOTAL (ej.
// 180 días = 6 meses), pero el cupo (clasesIncluidas) se resetea cada 30
// días desde fechaInicio, en vez de contarse una sola vez para todo el
// período. Se calcula en qué ciclo de 30 días cae "fechaReferencia" y se
// devuelve solo ese rango (recortado a fechaFin si el último ciclo queda más
// corto que 30 días). Para tipoCiclo "total" (o cuando no está seteado,
// planes/mensualidades de antes de este campo) se devuelve el rango
// completo, igual que siempre.
//
// fechaReferencia por defecto es "ahora" (para el uso más común: "¿cuántas
// clases me quedan hoy?", mostrado en el panel del cliente/admin). Pero al
// RESERVAR una clase hay que evaluar el ciclo al que pertenece la sesión que
// se está agendando, no el de hoy — si no, reservar con anticipación una
// clase de un ciclo futuro se contaba contra el ciclo actual (podía rechazar
// una reserva válida del próximo ciclo, o dejar pasar de largo el cupo real
// del ciclo futuro). Por eso se expone fechaReferencia como parámetro.
export const obtenerRangoConteo = (membresia, fechaReferencia = new Date()) => {
  if (membresia.tipoCiclo !== "mensual") {
    return { desde: membresia.fechaInicio, hasta: membresia.fechaFin };
  }

  const refMs = fechaReferencia.getTime();
  const inicioMs = membresia.fechaInicio.getTime();
  const finMs = membresia.fechaFin.getTime();

  const transcurridoMs = Math.max(0, Math.min(refMs, finMs) - inicioMs);
  const indiceCiclo = Math.floor(transcurridoMs / (CICLO_DIAS * DIA_MS));
  const desdeMs = inicioMs + indiceCiclo * CICLO_DIAS * DIA_MS;
  const hastaMs = Math.min(desdeMs + CICLO_DIAS * DIA_MS, finMs);

  return { desde: new Date(desdeMs), hasta: new Date(hastaMs) };
};

// Cuenta en tiempo real cuántas clases ya usó un cliente dentro del ciclo de
// su mensualidad (no se guarda un contador aparte para esto — solo sirve
// para MOSTRAR el estado; para RESERVAR de forma segura ante solicitudes
// simultáneas, ver helpers/cupoMembresiaClaseHelper.js).
export const contarClasesUsadasMembresia = async (membresia, fechaReferencia = new Date()) => {
  const { desde, hasta } = obtenerRangoConteo(membresia, fechaReferencia);

  return InscripcionClase.countDocuments({
    empresa: membresia.empresa,
    cliente: membresia.cliente,
    tipoAcceso: "membresia",
    estado: { $ne: "cancelada" },
    fecha: { $gte: desde, $lte: hasta },
  });
};
