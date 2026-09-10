// utils/precioEspecial.js
//
// Punto único donde se resuelve si una reserva puntual (barbero + servicio
// + fecha/hora) tiene un precio especial configurado — por un feriado
// habilitado o por una hora extraordinaria. Se usa SOLO en el momento de
// crear la reserva (mismo lugar donde hoy se llama a
// servicio.calcularPrecioFinal), para no crear un cálculo de precio
// paralelo: si esta función devuelve null, el llamador sigue exactamente
// el camino de siempre.
import excepcionHorarioModel from "../models/excepcionHorario.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const ZONA = "America/Santiago";

/**
 * Resuelve el precio especial (si hay alguno) contra una lista de
 * excepciones YA cargada — para no repetir una consulta a la base de
 * datos por cada hora cuando se evalúan varias horas del mismo día (ver
 * getHorasDisponibles, que llama esto una vez por cada hora del listado
 * público para que el precio que ve el cliente ANTES de reservar sea el
 * mismo que se le va a cobrar al confirmar — un solo cálculo, no dos).
 *
 * @param {Array} excepciones - excepciones tipo "trabajo_feriado"/"extra"
 *   de ESE barbero y ESE día (ya filtradas por fecha).
 * @param {string} horaStr - hora del slot a evaluar, formato "HH:mm".
 * @param {string} servicioId
 * @returns {number|null}
 */
export const resolverPrecioEspecial = (excepciones, horaStr, servicioId) => {
  for (const exc of excepciones || []) {
    if (!(exc.preciosEspeciales || []).length) continue;

    // "extra": el precio especial solo vale dentro de esa franja horaria
    // puntual. "trabajo_feriado" con horaInicio/horaFin propio: igual.
    // "trabajo_feriado" sin horario propio (usa el horario normal del
    // día): el precio especial vale para todo el feriado.
    if (exc.horaInicio && exc.horaFin) {
      if (horaStr < exc.horaInicio || horaStr >= exc.horaFin) continue;
    }

    const coincidencia = (exc.preciosEspeciales || []).find(
      (p) => String(p.servicio) === String(servicioId),
    );
    if (coincidencia) return coincidencia.precio;
  }

  return null;
};

/**
 * @param {string} barberoId
 * @param {string} servicioId
 * @param {Date|dayjs.Dayjs} fechaHoraReserva - inicio real de la reserva
 * @returns {Promise<number|null>} el precio especial si aplica, o null si
 *   debe usarse el precio normal del servicio (comportamiento de hoy).
 */
export const obtenerPrecioEspecial = async (
  barberoId,
  servicioId,
  fechaHoraReserva,
) => {
  if (!barberoId || !servicioId || !fechaHoraReserva) return null;

  const momentoChile = dayjs(fechaHoraReserva).tz(ZONA);
  const fechaStr = momentoChile.format("YYYY-MM-DD");
  const horaStr = momentoChile.format("HH:mm");

  const inicioDiaUTC = dayjs
    .tz(`${fechaStr} 00:00`, "YYYY-MM-DD HH:mm", ZONA)
    .utc()
    .toDate();
  const finDiaUTC = dayjs
    .tz(`${fechaStr} 23:59:59.999`, "YYYY-MM-DD HH:mm:ss.SSS", ZONA)
    .utc()
    .toDate();

  const excepciones = await excepcionHorarioModel
    .find({
      barbero: barberoId,
      fecha: { $gte: inicioDiaUTC, $lte: finDiaUTC },
      tipo: { $in: ["trabajo_feriado", "extra"] },
      "preciosEspeciales.0": { $exists: true },
    })
    .lean();

  if (!excepciones.length) return null;

  return resolverPrecioEspecial(excepciones, horaStr, servicioId);
};
