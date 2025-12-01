import ExcepcionHorario from "../models/excepcionHorario.model.js";
import dayjs from "dayjs";
import tz from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);
dayjs.extend(tz);

export const bloquearFeriado = async (
  barbero,
  fechaConsulta,
  horariosDisponibles
) => {
  const diaSemana = fechaConsulta.day();
  const fechaStr = fechaConsulta.format("YYYY-MM-DD");

  // Si ya existen excepciones automáticas del feriado, devolverlas
  const bloqueosExistentes = await ExcepcionHorario.find({
    barbero,
    fecha: new Date(fechaStr),
    motivo: "Feriado automático",
  });

  if (bloqueosExistentes.length > 0) {
    // Excluir horas que el barbero reactivó manualmente
    const desbloqueos = await ExcepcionHorario.find({
      barbero,
      fecha: new Date(fechaStr),
      tipo: "desbloqueo",
    });

    const horasDesbloqueadas = desbloqueos.map((d) => d.horaInicio);

    return bloqueosExistentes
      .map((b) => b.horaInicio)
      .filter((hora) => !horasDesbloqueadas.includes(hora));
  }

  // Calcular horas del día normalmente
  const bloques = horariosDisponibles.filter(
    (h) => Number(h.dia) === diaSemana
  );

  if (!bloques.length) return [];

  const horas = [];

  bloques.forEach((h) => {
    h.bloques.forEach((b) => {
      const [hi] = b.horaInicio.split(":").map(Number);
      const [hf] = b.horaFin.split(":").map(Number);

      let actual = hi;

      while (actual <= hf) {
        horas.push(`${String(actual).padStart(2, "0")}:00`);
        actual++;
      }
    });
  });

  // Crear bloqueos por feriado
  for (const hora of horas) {
    await ExcepcionHorario.create({
      barbero,
      fecha: new Date(fechaStr),
      horaInicio: hora,
      tipo: "bloqueo",
      motivo: "Feriado automático",
    });
  }

  return horas;
};
