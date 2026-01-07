// generarHorasDesdeHorario.js - VERSIÓN DEBUG
import dayjs from "dayjs";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore.js";

dayjs.extend(isSameOrBefore);

// generarHorasDesdeHorario.js - VERSIÓN SIN DAYJS (más simple)
export const generarHorasDesdeHorario = (horario) => {
  console.log("🎯 VERSIÓN SIN DAYJS - usando lógica pura");

  if (!horario || !horario.horaInicio || !horario.horaFin) {
    console.error("Horario inválido");
    return [];
  }

  const horasInicio = [];

  // Convertir HH:mm a minutos desde medianoche
  const toMinutes = (timeStr) => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
  };

  // Convertir minutos a HH:mm
  const fromMinutes = (totalMinutes) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}`;
  };

  const startMinutes = toMinutes(horario.horaInicio);
  const endMinutes = toMinutes(horario.horaFin);
  const breakStartMinutes = horario.colacionInicio
    ? toMinutes(horario.colacionInicio)
    : null;
  const breakEndMinutes = horario.colacionFin
    ? toMinutes(horario.colacionFin)
    : null;
  const intervaloMinimo = horario.intervaloMinimo || 60; // Mínimo de 15 minutos

  console.log("📊 Intervalo mínimo:", intervaloMinimo, "minutos");

  // Generar horas
  for (let time = startMinutes; time < endMinutes; time += intervaloMinimo) {
    const horaStr = fromMinutes(time);

    // Verificar si está en colación
    const enColacion =
      breakStartMinutes &&
      breakEndMinutes &&
      time >= breakStartMinutes &&
      time < breakEndMinutes;

    if (!enColacion) {
      horasInicio.push(horaStr);
      console.log(`✅ ${horaStr}`);
    } else {
      console.log(`🍽️ ${horaStr} en colación`);
    }
  }

  console.log(`📋 Total: ${horasInicio.length} horas`);
  return horasInicio;
};
