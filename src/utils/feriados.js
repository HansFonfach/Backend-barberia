// utils/feriados.js
import Feriado from "../models/feriados.js";
import dayjs from "dayjs";
import tz from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);
dayjs.extend(tz);

// Nueva función: verificar feriado con comportamiento - VERSIÓN CORREGIDA
export const verificarFeriadoConComportamiento = async (fechaStr) => {
  try {
    // Validar que la fechaStr no esté vacía
    if (!fechaStr || typeof fechaStr !== 'string') {
      console.error("Fecha no válida recibida:", fechaStr);
      return null;
    }

    // Validar formato básico YYYY-MM-DD
    const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!fechaRegex.test(fechaStr)) {
      console.error(`Formato de fecha inválido: ${fechaStr}. Se espera YYYY-MM-DD`);
      return null;
    }

    // Parsear con dayjs directamente
    const fechaDayjs = dayjs(fechaStr, "YYYY-MM-DD");
    
    if (!fechaDayjs.isValid()) {
      console.error(`Fecha inválida después de parsear: ${fechaStr}`);
      return null;
    }

    // Crear fechas para consulta
    const inicioDia = fechaDayjs.startOf("day").toDate();
    const finDia = fechaDayjs.endOf("day").toDate();

    // Buscar feriado
    const feriado = await Feriado.findOne({
      fecha: {
        $gte: inicioDia,
        $lt: finDia,
      },
      activo: true,
    });

    if (!feriado) return null;

    // Retornar objeto formateado
    return {
      _id: feriado._id,
      nombre: feriado.nombre,
      fecha: feriado.fecha,
      fechaFormateada: dayjs(feriado.fecha).format("YYYY-MM-DD"),
      comportamiento: feriado.comportamiento || "permitir_excepciones",
      activo: feriado.activo,
      // Asegurar que existe el campo
      __comportamiento: feriado.comportamiento || "permitir_excepciones",
    };
  } catch (error) {
    console.error("❌ Error en verificarFeriadoConComportamiento:", error);
    console.error("Stack trace:", error.stack);
    return null;
  }
};

// OPCIONAL: Función de depuración para ver qué está pasando
export const debugFeriadoConsulta = async (fechaStr) => {
 
  
  const fechaDayjs = dayjs(fechaStr, "YYYY-MM-DD");
 
  
  const inicioDia = fechaDayjs.startOf("day").toDate();
  const finDia = fechaDayjs.endOf("day").toDate();
 
  
  try {
    const feriado = await Feriado.findOne({
      fecha: {
        $gte: inicioDia,
        $lt: finDia,
      },
      activo: true,
    });
    
   
    return feriado;
  } catch (error) {
    console.error("Error en consulta:", error);
    return null;
  }
};

// Resto de las funciones (sin cambios)
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

  return horas;
};

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

  const horasDesbloqueadas = excepciones
    .filter((e) => e.tipo === "desbloqueo")
    .map((e) => e.horaInicio);

  const horasBloqueadasPorFeriado = todasLasHoras.filter(
    (hora) => !horasDesbloqueadas.includes(hora)
  );

  const horasDisponibles = [...horasDesbloqueadas];

  return {
    horasExtra,
    horasBloqueadas: horasBloqueadasPorFeriado,
    horasDisponibles: horasDisponibles,
    horasDesbloqueadas: horasDesbloqueadas,
    message: `FERIADO: ${feriado.nombre}. Las horas aparecen bloqueadas por defecto.`,
  };
};