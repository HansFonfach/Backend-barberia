// utils/feriados.js
import Feriado from "../models/feriados.js"; // Asegúrate de importar el modelo
import dayjs from "dayjs";
import tz from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);
dayjs.extend(tz);

// utils/feriados.js - Modifica bloquearFeriado
export const bloquearFeriado = async (
  barbero,
  fechaConsulta,
  horariosDisponibles
) => {
  const diaSemana = fechaConsulta.day();
  const fechaStr = fechaConsulta.format("YYYY-MM-DD");

  // Verificar si es feriado activo
  const feriado = await Feriado.findOne({
    fecha: {
      $gte: dayjs(fechaStr).startOf("day").toDate(),
      $lt: dayjs(fechaStr).endOf("day").toDate(),
    },
    activo: true,
    comportamiento: "bloquear_todo", // Solo aplicar si es bloquear_todo
  });

  if (!feriado) return [];

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

  // NO CREAR REGISTROS AUTOMÁTICOS
  // Solo devolver las horas que deberían considerarse bloqueadas
  return horas;
};

// Nueva función: verificar feriado con comportamiento
export const verificarFeriadoConComportamiento = async (fechaStr) => {
  try {
    const fecha = new Date(fechaStr);
    const feriado = await Feriado.findOne({
      fecha: {
        $gte: dayjs(fecha).startOf("day").toDate(),
        $lt: dayjs(fecha).endOf("day").toDate(),
      },
      activo: true,
    });

    if (!feriado) return null;

    return {
      _id: feriado._id,
      nombre: feriado.nombre,
      fecha: feriado.fecha,
      fechaFormateada: dayjs(feriado.fecha).format("YYYY-MM-DD"),
      comportamiento: feriado.comportamiento || "permitir_excepciones",
      activo: feriado.activo,
    };
  } catch (error) {
    console.error("❌ Error en verificarFeriadoConComportamiento:", error);
    return null;
  }
};

// Nueva función: determinar qué mostrar según feriado y usuario
export const determinarVistaSegunFeriado = (
  feriado,
  usuario,
  hayExcepcionesBarbero = false
) => {
  if (!feriado) return { mostrarHoras: true, mensaje: null, esFeriado: false };

  const esBarbero = usuario?.rol === "barbero";

  if (esBarbero) {
    return {
      mostrarHoras: true,
      mensaje: `FERIADO: ${feriado.nombre}. Puedes habilitar horas individualmente.`,
      esFeriado: true,
      comportamiento: feriado.comportamiento,
      mostrarTodasBloqueadas: true,
    };
  }

  // Para clientes
  if (feriado.comportamiento === "bloquear_todo") {
    return {
      mostrarHoras: false,
      mensaje: `Feriado nacional: ${feriado.nombre}`,
      esFeriado: true,
      comportamiento: "bloquear_todo",
    };
  }

  // Feriado que permite excepciones
  if (hayExcepcionesBarbero) {
    return {
      mostrarHoras: true,
      mensaje: `Feriado: ${feriado.nombre}. Algunas horas están disponibles.`,
      esFeriado: true,
      comportamiento: "permitir_excepciones",
    };
  } else {
    return {
      mostrarHoras: false,
      mensaje: `Feriado: ${feriado.nombre}. No hay horas habilitadas para este día.`,
      esFeriado: true,
      comportamiento: "permitir_excepciones",
    };
  }
};

export const getHorasParaBarberoFeriado = (
  todasLasHoras,
  excepciones,
  feriado
) => {
  const horasExtra = excepciones
    .filter((e) => e.tipo === "extra")
    .map((e) => e.horaInicio);

  const horasBloqueadasManual = excepciones
    .filter((e) => e.tipo === "bloqueo")
    .map((e) => e.horaInicio);

  // Para barbero viendo CUALQUIER feriado, todas las horas aparecen bloqueadas inicialmente
  const horasYaDesbloqueadas = horasBloqueadasManual;

  // Todas las horas base están bloqueadas por feriado
  const horasBloqueadasPorFeriado = todasLasHoras.filter(
    (hora) => !horasYaDesbloqueadas.includes(hora)
  );

  // Combinar bloqueos
  const todasHorasBloqueadas = [
    ...new Set([...horasBloqueadasPorFeriado, ...horasBloqueadasManual]),
  ];

  return {
    horasExtra,
    horasBloqueadas: todasHorasBloqueadas,
    horasDisponibles: [], // Ninguna disponible inicialmente
    message: `FERIADO: ${feriado.nombre}. Todas las horas aparecen bloqueadas. Haz clic en "Reactivar" para habilitar las que quieras trabajar.`,
  };
};
