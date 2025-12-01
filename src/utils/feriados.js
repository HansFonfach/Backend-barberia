// utils/feriados.js
import ExcepcionHorario from "../models/excepcionHorario.model.js";
import Feriado from "../models/feriados.js"; // Asegúrate de importar el modelo
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

  // Primero verificar si es feriado activo
  const feriado = await Feriado.findOne({
    fecha: {
      $gte: dayjs(fechaStr).startOf('day').toDate(),
      $lt: dayjs(fechaStr).endOf('day').toDate()
    },
    activo: true
  });

  if (!feriado) return []; // No es feriado, retornar vacío

  // Verificar comportamiento del feriado
  const comportamiento = feriado.comportamiento || "permitir_excepciones";
  
  // Si el feriado está configurado para "bloquear_todo", proceder con bloqueo automático
  if (comportamiento === "bloquear_todo") {
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
        motivo: `Feriado automático: ${feriado.nombre}`,
      });
    }

    return horas;
  }

  // Si el feriado es "permitir_excepciones", no bloquear automáticamente
  return [];
};

// Nueva función: verificar feriado con comportamiento
export const verificarFeriadoConComportamiento = async (fechaStr) => {
  try {
    const fecha = new Date(fechaStr);
    const feriado = await Feriado.findOne({
      fecha: {
        $gte: dayjs(fecha).startOf('day').toDate(),
        $lt: dayjs(fecha).endOf('day').toDate()
      },
      activo: true
    });

    if (!feriado) return null;

    return {
      _id: feriado._id,
      nombre: feriado.nombre,
      fecha: feriado.fecha,
      fechaFormateada: dayjs(feriado.fecha).format("YYYY-MM-DD"),
      comportamiento: feriado.comportamiento || "permitir_excepciones",
      activo: feriado.activo
    };
  } catch (error) {
    console.error("❌ Error en verificarFeriadoConComportamiento:", error);
    return null;
  }
};

// Nueva función: determinar qué mostrar según feriado y usuario
export const determinarVistaSegunFeriado = (feriado, usuario, hayExcepcionesBarbero = false) => {
  if (!feriado) return { mostrarHoras: true, mensaje: null, esFeriado: false };

  const esBarbero = usuario?.rol === "barbero";
  
  if (esBarbero) {
    return {
      mostrarHoras: true,
      mensaje: `FERIADO: ${feriado.nombre}. Puedes habilitar horas individualmente.`,
      esFeriado: true,
      comportamiento: feriado.comportamiento,
      mostrarTodasBloqueadas: true
    };
  }

  // Para clientes
  if (feriado.comportamiento === "bloquear_todo") {
    return {
      mostrarHoras: false,
      mensaje: `Feriado nacional: ${feriado.nombre}`,
      esFeriado: true,
      comportamiento: "bloquear_todo"
    };
  }

  // Feriado que permite excepciones
  if (hayExcepcionesBarbero) {
    return {
      mostrarHoras: true,
      mensaje: `Feriado: ${feriado.nombre}. Algunas horas están disponibles.`,
      esFeriado: true,
      comportamiento: "permitir_excepciones"
    };
  } else {
    return {
      mostrarHoras: false,
      mensaje: `Feriado: ${feriado.nombre}. No hay horas habilitadas para este día.`,
      esFeriado: true,
      comportamiento: "permitir_excepciones"
    };
  }
};