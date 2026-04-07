import excepcionHorarioModel from "../models/excepcionHorario.model.js";
import Reserva from "../models/reserva.model.js";
import { getHorasDisponibles } from "../controllers/horarioController.js";
import { formatHora } from "../utils/horas.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore.js";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

/**
 * Valida si un slot está disponible para un barbero.
 * @returns { ok: true } | { ok: false, message: string }
 */
export const validarDisponibilidad = async ({
  barberoDoc,
  barbero,
  servicio,
  fecha,
  hora,
  duracionServicio,
  excluirReservaId = null, // ← clave para reagendamiento
}) => {
  const horaFormateada = formatHora(hora);
  const inicioReservaChile = dayjs.tz(
    `${fecha} ${horaFormateada}`,
    "YYYY-MM-DD HH:mm",
    "America/Santiago"
  );
  const finReservaChile = inicioReservaChile.add(duracionServicio, "minute");
  const diaSemana = inicioReservaChile.day();

  // Horarios del día
  const horariosDelDia = barberoDoc.horariosDisponibles.filter(
    (h) => Number(h.diaSemana) === diaSemana
  );
  if (!horariosDelDia.length)
    return { ok: false, message: "El barbero no trabaja este día" };

  let bloqueValido = null;
  for (const h of horariosDelDia) {
    const ini = dayjs.tz(`${fecha} ${h.horaInicio}`, "YYYY-MM-DD HH:mm", "America/Santiago");
    const fin = dayjs.tz(`${fecha} ${h.horaFin}`, "YYYY-MM-DD HH:mm", "America/Santiago");
    if (inicioReservaChile.isSameOrAfter(ini) && finReservaChile.isSameOrBefore(fin)) {
      bloqueValido = { inicio: ini, fin };
      break;
    }
  }
  if (!bloqueValido)
    return { ok: false, message: "El servicio no cabe en el horario del barbero" };

  // Excepciones / bloqueos
  const inicioBusqueda = inicioReservaChile.startOf("day").subtract(4, "hour").utc().toDate();
  const finBusqueda = inicioReservaChile.endOf("day").add(4, "hour").utc().toDate();

  const excepciones = await excepcionHorarioModel.find({
    barbero,
    fecha: { $gte: inicioBusqueda, $lt: finBusqueda },
    tipo: "bloqueo",
  });

  const horasBloqueadas = excepciones.map((e) =>
    dayjs(e.fecha).tz("America/Santiago").format("HH:mm")
  );
  if (horasBloqueadas.includes(horaFormateada))
    return { ok: false, message: "La hora está bloqueada por el barbero" };

  // Horas disponibles (intervalo)
  let horasDisponiblesData = null;
  await getHorasDisponibles(
    { params: { id: barbero }, query: { fecha, servicioId: servicio }, usuario: null },
    { json: (data) => { horasDisponiblesData = data; } }
  );

  if (!horasDisponiblesData?.horas)
    return { ok: false, message: "No se pudo validar disponibilidad" };

  const horaDisponible = horasDisponiblesData.horas.find(
    (h) => h.hora === horaFormateada && h.estado === "disponible"
  );
  if (!horaDisponible)
    return { ok: false, message: "La hora seleccionada ya no está disponible" };

  // Colisiones (excluyendo la reserva que se está reagendando)
  const reservasDelDia = await Reserva.find({
    barbero,
    fecha: { $gte: inicioBusqueda, $lt: finBusqueda },
    estado: { $in: ["pendiente", "confirmada"] },
    ...(excluirReservaId ? { _id: { $ne: excluirReservaId } } : {}),
  });

  for (const r of reservasDelDia) {
    const ini = dayjs(r.fecha).tz("America/Santiago");
    const fin = ini.add(r.duracion, "minute");
    if (inicioReservaChile.isBefore(fin) && finReservaChile.isAfter(ini))
      return { ok: false, message: "La hora ya está ocupada" };
  }

  return { ok: true, inicioReservaChile, finReservaChile };
};