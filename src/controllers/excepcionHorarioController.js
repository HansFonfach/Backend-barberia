import excepcionHorario from "../models/excepcionHorario.model.js";
import Reserva from "../models/reserva.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import feriados from "../models/feriados.js";
import usuarioModel from "../models/usuario.model.js";
import feriadoEmpresaModel from "../models/feriadoEmpresa.model.js";


dayjs.extend(utc);
dayjs.extend(timezone);

// Rango completo del día en Chile → UTC (mismo criterio que obtenerExcepcionesPorDia)
const rangoDiaChileUTC = (fechaStr) => {
  const inicio = dayjs.tz(
    `${fechaStr} 00:00`,
    "YYYY-MM-DD HH:mm",
    "America/Santiago",
  );
  const fin = dayjs.tz(
    `${fechaStr} 23:59:59.999`,
    "YYYY-MM-DD HH:mm:ss.SSS",
    "America/Santiago",
  );

  return { inicioUTC: inicio.utc().toDate(), finUTC: fin.utc().toDate() };
};

// Función auxiliar para convertir fecha Chile a UTC
const fechaChileToUTC = (fechaChileStr) => {
  return dayjs(fechaChileStr)
    .tz("America/Santiago", true) // 👈 interpreta como hora Chile real
    .startOf("day") // 👈 asegura 00:00
    .utc()
    .toDate();
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
  const {
    barbero,
    fecha,
    horaInicio,
    horaFin,
    serviciosPermitidos = [],
    preciosEspeciales = [], // ✅ opcional: [{ servicio, precio }]
  } = req.body;
  try {
    const fechaUTC = fechaChileToUTC(fecha);

    const horaExtra = await excepcionHorario.create({
      barbero,
      fecha: fechaUTC,
      horaInicio,
      horaFin,
      tipo: "extra",
      serviciosPermitidos, // ✅
      preciosEspeciales, // ✅
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

  console.log(fecha);

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

// Actualiza la horaFin (duración) de una hora extra ya creada.
// No permite dejar afuera reservas que ya se hicieron dentro de ella:
// si alguna reserva activa terminaría después del nuevo horaFin, se rechaza.
export const actualizarHoraExtra = async (req, res) => {
  const { barbero, fecha, horaInicio, horaFin, serviciosPermitidos, preciosEspeciales } =
    req.body;

  if (!barbero || !fecha || !horaInicio || !horaFin) {
    return res.status(400).json({
      message: "barbero, fecha, horaInicio y horaFin son requeridos",
    });
  }

  if (horaFin <= horaInicio) {
    return res.status(400).json({
      message: "horaFin debe ser posterior a horaInicio",
    });
  }

  try {
    const fechaUTC = fechaChileToUTC(fecha);

    const horaExtra = await excepcionHorario.findOne({
      barbero,
      fecha: fechaUTC,
      horaInicio,
      tipo: "extra",
    });

    if (!horaExtra) {
      return res.status(404).json({ message: "No se encontró la hora extra" });
    }

    // ── No permitir que el nuevo horaFin deje afuera una reserva que ya existe ──
    const finNuevo = dayjs.tz(
      `${fecha} ${horaFin}`,
      "YYYY-MM-DD HH:mm",
      "America/Santiago",
    );

    const inicioBusqueda = dayjs
      .tz(fecha, "YYYY-MM-DD", "America/Santiago")
      .startOf("day")
      .subtract(4, "hour")
      .utc()
      .toDate();
    const finBusqueda = dayjs
      .tz(fecha, "YYYY-MM-DD", "America/Santiago")
      .endOf("day")
      .add(4, "hour")
      .utc()
      .toDate();

    const reservasDelDia = await Reserva.find({
      barbero,
      fecha: { $gte: inicioBusqueda, $lt: finBusqueda },
      estado: { $in: ["pendiente", "confirmada"] },
    });

    const reservasEnEstaHoraExtra = reservasDelDia.filter(
      (r) =>
        dayjs(r.fecha).tz("America/Santiago").format("HH:mm") === horaInicio,
    );

    const reservaQueNoCabe = reservasEnEstaHoraExtra.find((r) => {
      const finReserva = dayjs(r.fecha)
        .tz("America/Santiago")
        .add(r.duracion || 30, "minute");
      return finReserva.isAfter(finNuevo);
    });

    if (reservaQueNoCabe) {
      const finReservaStr = dayjs(reservaQueNoCabe.fecha)
        .tz("America/Santiago")
        .add(reservaQueNoCabe.duracion || 30, "minute")
        .format("HH:mm");

      return res.status(409).json({
        message: `No se puede acortar la hora extra hasta las ${horaFin}: ya hay una reserva que termina a las ${finReservaStr}`,
      });
    }

    horaExtra.horaFin = horaFin;
    if (Array.isArray(serviciosPermitidos)) {
      horaExtra.serviciosPermitidos = serviciosPermitidos;
    }
    if (Array.isArray(preciosEspeciales)) {
      horaExtra.preciosEspeciales = preciosEspeciales;
    }
    await horaExtra.save();

    res.status(200).json({
      message: "Hora extra actualizada correctamente",
      horaExtra,
      fechaOriginal: fecha,
    });
  } catch (error) {
    console.error("❌ Error en actualizarHoraExtra:", error);
    res.status(500).json({
      message: "Error al actualizar la hora extra",
      error: error.message,
    });
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

  if (!barbero || !fechaInicio || !fechaFin) {
    return res.status(400).json({
      message: "barbero, fechaInicio y fechaFin son requeridos",
    });
  }

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

export const toggleTrabajoFeriado = async (req, res) => {
  const { barbero, fecha } = req.body;

  if (!barbero || !fecha) {
    return res.status(400).json({ message: "barbero y fecha son requeridos" });
  }

  try {
    const { inicioUTC, finUTC } = rangoDiaChileUTC(fecha);

    const feriado = await feriados.findOne({
      fecha: { $gte: inicioUTC, $lte: finUTC },
      activo: true,
    });

    if (!feriado) {
      return res
        .status(404)
        .json({ message: "No hay un feriado activo en esa fecha" });
    }

    const existente = await excepcionHorario.findOne({
      barbero,
      tipo: "trabajo_feriado",
      fecha: { $gte: inicioUTC, $lte: finUTC },
    });

    if (existente) {
      await excepcionHorario.findByIdAndDelete(existente._id);

      return res.status(200).json({
        message: `Ya no trabajarás el feriado "${feriado.nombre}"`,
        trabaja: false,
        fechaOriginal: fecha,
        barbero,
      });
    }

    const nuevaExcepcion = await excepcionHorario.create({
      barbero,
      tipo: "trabajo_feriado",
      fecha: fechaChileToUTC(fecha),
      motivo: `Trabaja el feriado ${feriado.nombre}`,
    });

    return res.status(201).json({
      message: `Trabajarás el feriado "${feriado.nombre}"`,
      trabaja: true,
      fechaOriginal: fecha,
      barbero,
      excepcion: nuevaExcepcion,
    });
  } catch (error) {
    console.error("❌ Error en toggleTrabajoFeriado:", error);
    res.status(500).json({
      message: "Error al actualizar el feriado",
      error: error.message,
    });
  }
};

export const obtenerFeriadosConEstado = async (req, res) => {
  const { barberoId } = req.params;

  try {
    const hoyUTC = dayjs().tz("America/Santiago").startOf("day").utc().toDate();

    const [feriado, excepciones] = await Promise.all([
      feriados.find({ activo: true, fecha: { $gte: hoyUTC } })
        .sort({ fecha: 1 })
        .lean(),
      excepcionHorario
        .find({
          barbero: barberoId,
          tipo: "trabajo_feriado",
          fecha: { $gte: hoyUTC },
        })
        .lean(),
    ]);

    const trabajaEn = new Set(
      excepciones.map((e) =>
        dayjs(e.fecha).tz("America/Santiago").format("YYYY-MM-DD"),
      ),
    );

    const resultado = feriado.map((f) => {
      const fechaChile = dayjs(f.fecha)
        .tz("America/Santiago")
        .format("YYYY-MM-DD");

      return {
        id: f._id,
        nombre: f.nombre,
        fecha: fechaChile,
        trabaja: trabajaEn.has(fechaChile),
      };
    });

    return res.status(200).json({
      feriados: resultado,
      total: resultado.length,
    });
  } catch (error) {
    console.error("❌ Error en obtenerFeriadosConEstado:", error);
    res.status(500).json({
      message: "Error al obtener feriados",
      error: error.message,
    });
  }
};

/* =====================================================
   CONFIGURACIÓN DETALLADA DE FERIADO POR PROFESIONAL (admin)

   A diferencia de toggleTrabajoFeriado (el interruptor simple de
   siempre, que cualquier profesional sigue pudiendo usar para sí
   mismo), esta función es la que usa un admin/secretaria desde el
   panel de equipo para armar el detalle de UN profesional en UN
   feriado: horario propio (opcional), servicios disponibles
   (opcional) y precio especial por servicio (opcional). Si no se
   manda horario o servicios, ese profesional sigue trabajando con
   su horario y servicios habituales — nada que configurar de más.
===================================================== */

/** Revisa si alguna reserva YA agendada quedaría fuera de la nueva
 * configuración (horario más acotado, o un servicio que deja de estar
 * permitido). Devuelve la lista de conflictos, vacía si no hay ninguno. */
const conflictosPorConfiguracion = async (
  barberoId,
  fecha,
  { horaInicio, horaFin, serviciosPermitidos },
) => {
  const { inicioUTC, finUTC } = rangoDiaChileUTC(fecha);

  const reservasDelDia = await Reserva.find({
    barbero: barberoId,
    fecha: { $gte: inicioUTC, $lte: finUTC },
    estado: { $in: ["pendiente", "confirmada"] },
  }).populate("servicio", "nombre");

  if (!reservasDelDia.length) return [];

  const conflictos = [];

  for (const r of reservasDelDia) {
    const horaReserva = dayjs(r.fecha).tz("America/Santiago").format("HH:mm");
    const finReserva = dayjs(r.fecha)
      .tz("America/Santiago")
      .add(r.duracion || 30, "minute")
      .format("HH:mm");

    const fueraDeHorario =
      horaInicio &&
      horaFin &&
      (horaReserva < horaInicio || finReserva > horaFin);

    const servicioNoPermitido =
      Array.isArray(serviciosPermitidos) &&
      serviciosPermitidos.length > 0 &&
      !serviciosPermitidos.map(String).includes(String(r.servicio?._id));

    if (fueraDeHorario || servicioNoPermitido) {
      conflictos.push({
        id: r._id,
        hora: horaReserva,
        servicio: r.servicio?.nombre || "Servicio",
        motivo: fueraDeHorario
          ? "queda fuera del nuevo horario"
          : "el servicio ya no estaría disponible",
      });
    }
  }

  return conflictos;
};

export const configurarTrabajoFeriado = async (req, res) => {
  const {
    barberoId,
    fecha,
    horaInicio,
    horaFin,
    serviciosPermitidos,
    preciosEspeciales,
  } = req.body;

  if (!req.usuario?.esAdmin) {
    return res.status(403).json({
      message:
        "Solo un administrador puede configurar el equipo para un feriado",
    });
  }

  if (!barberoId || !fecha) {
    return res
      .status(400)
      .json({ message: "barberoId y fecha son requeridos" });
  }

  try {
    // El profesional tiene que ser de la misma empresa que el admin que
    // está configurando — nunca confiar en un barberoId que llega del
    // cliente sin verificar a quién pertenece.
    const barbero = await usuarioModel.findOne({
      _id: barberoId,
      empresa: req.usuario.empresaId,
      rol: "barbero",
    });

    if (!barbero) {
      return res
        .status(403)
        .json({ message: "Ese profesional no pertenece a tu empresa" });
    }

    const { inicioUTC, finUTC } = rangoDiaChileUTC(fecha);

    const feriadoDelDia = await feriados.findOne({
      fecha: { $gte: inicioUTC, $lte: finUTC },
      activo: true,
    });

    if (!feriadoDelDia) {
      return res.status(400).json({ message: "Esa fecha no es un feriado" });
    }

    // La empresa tiene que haber habilitado este feriado primero — no se
    // puede configurar a un profesional para un día que la empresa
    // todavía tiene cerrado.
    const feriadoEmpresa = await feriadoEmpresaModel.findOne({
      empresa: req.usuario.empresaId,
      feriado: feriadoDelDia._id,
    });

    if (!feriadoEmpresa?.habilitado) {
      return res.status(400).json({
        message: `Primero debes habilitar el feriado "${feriadoDelDia.nombre}" para tu empresa`,
      });
    }

    if (horaInicio && horaFin && horaFin <= horaInicio) {
      return res
        .status(400)
        .json({ message: "horaFin debe ser posterior a horaInicio" });
    }

    const conflictos = await conflictosPorConfiguracion(barberoId, fecha, {
      horaInicio,
      horaFin,
      serviciosPermitidos,
    });

    if (conflictos.length) {
      return res.status(409).json({
        message:
          "Ya hay reservas ese día que quedarían fuera de esta configuración. Revísalas antes de guardar.",
        conflictos,
      });
    }

    const datos = {
      barbero: barberoId,
      tipo: "trabajo_feriado",
      fecha: fechaChileToUTC(fecha),
      motivo: `Trabaja el feriado ${feriadoDelDia.nombre}`,
      // null (no undefined) a propósito: si el admin desmarca "horario
      // propio" después de haberlo configurado, esto SÍ borra el valor
      // anterior en la base — con undefined, Mongoose lo habría ignorado
      // y habría dejado pegado el horario viejo.
      horaInicio: horaInicio || null,
      horaFin: horaFin || null,
      serviciosPermitidos: Array.isArray(serviciosPermitidos)
        ? serviciosPermitidos
        : [],
      preciosEspeciales: Array.isArray(preciosEspeciales)
        ? preciosEspeciales
        : [],
    };

    const excepcion = await excepcionHorario.findOneAndUpdate(
      {
        barbero: barberoId,
        tipo: "trabajo_feriado",
        fecha: { $gte: inicioUTC, $lte: finUTC },
      },
      datos,
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    return res.status(200).json({
      message: `${barbero.nombre} queda configurado para trabajar el feriado "${feriadoDelDia.nombre}"`,
      excepcion,
    });
  } catch (error) {
    console.error("❌ Error en configurarTrabajoFeriado:", error);
    res.status(500).json({
      message: "Error al configurar el feriado",
      error: error.message,
    });
  }
};

export const quitarTrabajoFeriado = async (req, res) => {
  const { barberoId, fecha } = req.body;

  if (!req.usuario?.esAdmin) {
    return res.status(403).json({
      message:
        "Solo un administrador puede quitar a un profesional de un feriado",
    });
  }

  if (!barberoId || !fecha) {
    return res
      .status(400)
      .json({ message: "barberoId y fecha son requeridos" });
  }

  try {
    const barbero = await usuarioModel.findOne({
      _id: barberoId,
      empresa: req.usuario.empresaId,
      rol: "barbero",
    });

    if (!barbero) {
      return res
        .status(403)
        .json({ message: "Ese profesional no pertenece a tu empresa" });
    }

    const { inicioUTC, finUTC } = rangoDiaChileUTC(fecha);

    const reservasDelDia = await Reserva.countDocuments({
      barbero: barberoId,
      fecha: { $gte: inicioUTC, $lte: finUTC },
      estado: { $in: ["pendiente", "confirmada"] },
    });

    if (reservasDelDia > 0) {
      return res.status(409).json({
        message: `${barbero.nombre} ya tiene ${reservasDelDia} reserva(s) ese día. Reagéndalas o cancélalas antes de quitarlo del feriado.`,
      });
    }

    await excepcionHorario.findOneAndDelete({
      barbero: barberoId,
      tipo: "trabajo_feriado",
      fecha: { $gte: inicioUTC, $lte: finUTC },
    });

    return res.status(200).json({
      message: `${barbero.nombre} ya no trabaja ese feriado`,
    });
  } catch (error) {
    console.error("❌ Error en quitarTrabajoFeriado:", error);
    res.status(500).json({
      message: "Error al quitar el feriado",
      error: error.message,
    });
  }
};
