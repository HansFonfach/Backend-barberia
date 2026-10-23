// Utilidades de fecha/hora del módulo de reservas de mesa. Todo en hora de
// Chile, como el resto del sistema. Funciones puras: se prueban sin base.
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import customParseFormat from "dayjs/plugin/customParseFormat.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

export const ZONA = "America/Santiago";

// Tamaño fijo de la franja con que se cuenta la ocupación. Es independiente
// del intervalo de horas que se ofrece (15/30/60), así cambiar ese intervalo
// nunca desalinea los contadores ya guardados.
export const PASO_FRANJA_MIN = 15;
const PASO_MS = PASO_FRANJA_MIN * 60 * 1000;

const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export const esHoraValida = (h) => typeof h === "string" && RE_HORA.test(h);

export const esFechaValida = (f) =>
  typeof f === "string" &&
  RE_FECHA.test(f) &&
  dayjs(f, "YYYY-MM-DD", true).isValid();

export const minutosDeHora = (h) => {
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + mm;
};

export const horaDeMinutos = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Momento (dayjs en zona Chile) de una fecha + hora de Chile. */
export const instante = (fecha, hora) =>
  dayjs.tz(`${fecha} ${hora}`, "YYYY-MM-DD HH:mm", ZONA);

export const ahoraChile = (ahora = new Date()) => dayjs(ahora).tz(ZONA);

export const fechaChile = (momento) => dayjs(momento).tz(ZONA).format("YYYY-MM-DD");

export const horaChile = (momento) => dayjs(momento).tz(ZONA).format("HH:mm");

export const hoyChile = (ahora = new Date()) => fechaChile(ahora);

/** 0 = domingo ... 6 = sábado, del día de Chile. */
export const diaSemana = (fecha) => dayjs.tz(`${fecha} 12:00`, "YYYY-MM-DD HH:mm", ZONA).day();

export const sumarDias = (fecha, dias) =>
  dayjs.tz(`${fecha} 12:00`, "YYYY-MM-DD HH:mm", ZONA).add(dias, "day").format("YYYY-MM-DD");

/**
 * Franjas de 15 minutos (inicio de cada una, como Date UTC) que toca el
 * intervalo [inicio, fin). Chile usa desfases de horas enteras, así que
 * alinear a 15 minutos en UTC es lo mismo que en hora local.
 */
export const franjasEntre = (inicio, fin) => {
  const desde = Math.floor(new Date(inicio).getTime() / PASO_MS) * PASO_MS;
  const hasta = new Date(fin).getTime();
  const franjas = [];
  for (let t = desde; t < hasta; t += PASO_MS) franjas.push(new Date(t));
  return franjas;
};
