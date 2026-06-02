import excepcionHorarioModel from "../models/excepcionHorario.model.js";
import Reserva from "../models/reserva.model.js";
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

export const validarDisponibilidad = async ({
  barberoDoc,
  barbero,
  servicio,
  fecha,
  hora,
  duracionServicio,
  excluirReservaId = null,
}) => {
  console.log("=== validarDisponibilidad INICIO ===");
  console.log({ barbero, servicio, fecha, hora, duracionServicio, excluirReservaId });

  const horaFormateada = formatHora(hora);
  const inicioReservaChile = dayjs.tz(
    `${fecha} ${horaFormateada}`,
    "YYYY-MM-DD HH:mm",
    "America/Santiago",
  );
  const finReservaChile = inicioReservaChile.add(duracionServicio, "minute");
  const diaSemana = inicioReservaChile.day();

  console.log("horaFormateada:", horaFormateada);
  console.log("inicioReservaChile:", inicioReservaChile.format());
  console.log("finReservaChile:", finReservaChile.format());

  // Horarios del día
  const horariosDelDia = barberoDoc.horariosDisponibles.filter(
    (h) => Number(h.diaSemana) === diaSemana,
  );
  console.log("horariosDelDia:", horariosDelDia.length);

  if (!horariosDelDia.length)
    return { ok: false, message: "El barbero no trabaja este día" };

  let bloqueValido = null;
  for (const h of horariosDelDia) {
    const ini = dayjs.tz(`${fecha} ${h.horaInicio}`, "YYYY-MM-DD HH:mm", "America/Santiago");
    const fin = dayjs.tz(`${fecha} ${h.horaFin}`, "YYYY-MM-DD HH:mm", "America/Santiago");
    console.log("Bloque horario:", h.horaInicio, "→", h.horaFin);
    console.log("¿Cabe?", inicioReservaChile.isSameOrAfter(ini), finReservaChile.isSameOrBefore(fin));
    if (inicioReservaChile.isSameOrAfter(ini) && finReservaChile.isSameOrBefore(fin)) {
      bloqueValido = { inicio: ini, fin };
      break;
    }
  }

  console.log("bloqueValido:", bloqueValido ? "SÍ" : "NO");
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
    dayjs(e.fecha).tz("America/Santiago").format("HH:mm"),
  );
  console.log("horasBloqueadas:", horasBloqueadas);

  if (horasBloqueadas.includes(horaFormateada))
    return { ok: false, message: "La hora está bloqueada por el barbero" };

  // Colisiones (excluyendo la reserva que se está reagendando)
  const reservasDelDia = await Reserva.find({
    barbero,
    fecha: { $gte: inicioBusqueda, $lt: finBusqueda },
    estado: { $in: ["pendiente", "confirmada"] },
    ...(excluirReservaId ? { _id: { $ne: excluirReservaId } } : {}),
  });

  console.log("reservasDelDia encontradas:", reservasDelDia.length);
  reservasDelDia.forEach((r) => {
    console.log("  reserva:", r._id, "fecha:", dayjs(r.fecha).tz("America/Santiago").format("HH:mm"), "duracion:", r.duracion);
  });

  for (const r of reservasDelDia) {
    const ini = dayjs(r.fecha).tz("America/Santiago");
    const fin = ini.add(r.duracion, "minute");
    const colisiona = inicioReservaChile.isBefore(fin) && finReservaChile.isAfter(ini);
    console.log("¿Colisiona con", dayjs(r.fecha).tz("America/Santiago").format("HH:mm"), "?", colisiona);
    if (colisiona)
      return { ok: false, message: "La hora ya está ocupada" };
  }

  console.log("=== validarDisponibilidad OK ===");
  return { ok: true, inicioReservaChile, finReservaChile };
};