import excepcionHorario from "../models/excepcionHorario.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

// Función auxiliar para convertir fecha Chile a UTC
const fechaChileToUTC = (fechaChileStr) => {
  const fechaChile = dayjs.tz(
    `${fechaChileStr} 00:00`,
    "YYYY-MM-DD HH:mm",
    "America/Santiago",
  );
  return fechaChile.utc().toDate();
};

// **FUNCIÓN PRINCIPAL ÚNICA - Maneja tanto cancelar como reactivar**
export const toggleHora = async (req, res) => {
  const { barbero, fecha, horaInicio, motivo } = req.body;

  try {
    const fechaUTC = fechaChileToUTC(fecha);

    // Verificar si ya existe un bloqueo para esta hora
    const bloqueoExistente = await excepcionHorario.findOne({
      barbero,
      fecha: fechaUTC,
      horaInicio,
      tipo: "bloqueo",
    });

    if (bloqueoExistente) {
      // Si EXISTE → eliminarlo (REACTIVAR la hora)
      await excepcionHorario.findByIdAndDelete(bloqueoExistente._id);

      return res.status(200).json({
        message: "Hora reactivada correctamente",
        accion: "reactivada",
        fechaOriginal: fecha,
        hora: horaInicio,
        barbero,
      });
    } else {
      // Si NO existe → crearlo (CANCELAR la hora)
      const nuevoBloqueo = await excepcionHorario.create({
        barbero,
        fecha: fechaUTC,
        horaInicio,
        motivo: motivo || "Cancelación manual",
        tipo: "bloqueo",
      });

      return res.status(201).json({
        message: "Hora cancelada correctamente",
        accion: "cancelada",
        fechaOriginal: fecha,
        hora: horaInicio,
        barbero,
        bloqueo: nuevoBloqueo,
      });
    }
  } catch (error) {
    console.error("❌ Error en toggleHora:", error);
    res.status(500).json({
      message: "Error al modificar la hora",
      error: error.message,
    });
  }
};

export const agregarHoraExtra = async (req, res) => {
  const { barbero, fecha, horaInicio } = req.body;

  try {
    const fechaUTC = fechaChileToUTC(fecha);

    const horaExtra = await excepcionHorario.create({
      barbero,
      fecha: fechaUTC,
      horaInicio,
      tipo: "extra",
    });

    res.status(201).json({
      message: "Hora extra agregada correctamente",
      horaExtra,
      fechaOriginal: fecha,
    });
  } catch (error) {
    console.error("❌ Error en agregarHoraExtra:", error);
    res.status(500).json({ message: "Error al agregar la hora extra", error });
  }
};

export const eliminarHoraExtra = async (req, res) => {
  const { barbero, fecha, horaInicio } = req.body;

  try {
    const fechaUTC = fechaChileToUTC(fecha);

    const horaExtraEliminada = await excepcionHorario.findOneAndDelete({
      barbero,
      fecha: fechaUTC,
      horaInicio,
      tipo: "extra",
    });

    if (!horaExtraEliminada)
      return res.status(404).json({ message: "No se encontró la hora extra" });

    res.status(200).json({
      message: "Hora extra eliminada correctamente",
      fechaOriginal: fecha,
    });
  } catch (error) {
    console.error("❌ Error en eliminarHoraExtra:", error);
    res.status(500).json({ message: "Error al eliminar la hora extra", error });
  }
};

export const obtenerExcepcionesPorDia = async (req, res) => {
  const { barberoId } = req.params;
  const { fecha } = req.query;

  if (!fecha) {
    return res.status(400).json({ message: "Se requiere la fecha" });
  }

  try {
    const inicioDiaChile = dayjs.tz(
      `${fecha} 00:00`,
      "YYYY-MM-DD HH:mm",
      "America/Santiago",
    );
    const finDiaChile = dayjs.tz(
      `${fecha} 23:59:59.999`,
      "YYYY-MM-DD HH:mm:ss.SSS",
      "America/Santiago",
    );

    const inicioUTC = inicioDiaChile.utc().toDate();
    const finUTC = finDiaChile.utc().toDate();

    const excepciones = await excepcionHorario
      .find({
        barbero: barberoId,
        fecha: { $gte: inicioUTC, $lte: finUTC },
      })
      .sort({ horaInicio: 1 });

    const excepcionesFormateadas = excepciones.map((excepcion) => {
      const fechaUTC = dayjs(excepcion.fecha);
      const fechaChile = fechaUTC.tz("America/Santiago");

      return {
        id: excepcion._id,
        hora: excepcion.horaInicio, // 👈 CONTRATO ÚNICO
        tipo: excepcion.tipo,
        fechaChile: fechaChile.format("YYYY-MM-DD"),
      };
    });

    res.status(200).json({
      fecha,
      excepciones: excepcionesFormateadas,
      total: excepcionesFormateadas.length,
    });
  } catch (error) {
    console.error("❌ Error al obtener excepciones:", error);
    res.status(500).json({ message: "Error al obtener excepciones", error });
  }
};

export const crearBloqueoVacaciones = async (req, res) => {
  const { barbero, fechaInicio, fechaFin, motivo } = req.body;
  console.log(fechaInicio, fechaFin);

  if (!barbero || !fechaInicio || !fechaFin) {
    return res.status(400).json({
      message: "barbero, fechaInicio y fechaFin son requeridos",
    });
  }
  console.log(fechaInicio, fechaFin);

  try {
    // Convertir fecha Chile → UTC
    const inicio = dayjs
      .tz(fechaInicio, "YYYY-MM-DD", "America/Santiago")
      .startOf("day")
      .utc()
      .toDate();

    const fin = dayjs
      .tz(fechaFin, "YYYY-MM-DD", "America/Santiago")
      .endOf("day")
      .utc()
      .toDate();

    if (fin < inicio) {
      return res.status(400).json({
        message: "fechaFin debe ser posterior a fechaInicio",
      });
    }

    // Evitar superposición de vacaciones
    const existe = await excepcionHorario.findOne({
      barbero,
      tipo: "vacaciones",
      fechaInicio: { $lte: fin },
      fechaFin: { $gte: inicio },
    });

    if (existe) {
      return res.status(409).json({
        message: "Ya existe un rango de vacaciones que se superpone con este",
      });
    }

    const nuevaVacacion = await excepcionHorario.create({
      barbero,
      tipo: "vacaciones",
      fechaInicio: inicio,
      fechaFin: fin,
      motivo: motivo || "Vacaciones",
    });

    return res.status(201).json({
      message: "Vacaciones registradas correctamente",
      data: nuevaVacacion,
    });
  } catch (error) {
    console.error("❌ Error al crear vacaciones:", error);

    return res.status(500).json({
      message: "Error interno al crear vacaciones",
    });
  }
};

export const eliminarBloqueoVacaciones = async (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({
      message: "El id es requerido",
    });
  }

  try {
    const eliminado = await excepcionHorario.findByIdAndDelete(id);

    if (!eliminado) {
      return res.status(404).json({
        message: "Vacación no encontrada",
      });
    }

    return res.json({
      message: "Vacaciones eliminadas correctamente",
    });
  } catch (error) {
    console.error("❌ Error al eliminar vacaciones:", error);

    res.status(500).json({
      message: "Error al eliminar vacaciones",
    });
  }
};

export const obtenerVacaciones = async (req, res) => {
  const { barberoId } = req.params;

  try {
    const vacaciones = await excepcionHorario
      .find({ barbero: barberoId, tipo: "vacaciones" })
      .sort({ fechaInicio: 1 });

    const rangos = vacaciones.map((v) => ({
      _id: v._id,
      motivo: v.motivo,

      fechaInicio: dayjs(v.fechaInicio)
        .tz("America/Santiago")
        .format("YYYY-MM-DD"),

      fechaFin: dayjs(v.fechaFin).tz("America/Santiago").format("YYYY-MM-DD"),
    }));

    return res.status(200).json({ rangos });
  } catch (error) {
    console.error("❌ Error en obtenerVacaciones:", error);

    res.status(500).json({
      message: "Error al obtener vacaciones",
    });
  }
};
