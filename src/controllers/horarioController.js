import Horario from "../models/horario.model.js";
import Usuario from "../models/usuario.model.js";
import Reserva from "../models/reserva.model.js";
import { generarHoras } from "../utils/horas.js";
import Suscripcion from "../models/suscripcion.model.js";
import ExcepcionHorarioModel from "../models/excepcionHorario.model.js";
import horarioModel from "../models/horario.model.js";
import dayjs from "dayjs";

/** Crear horario y asignarlo al barbero */
export const createHorario = async (req, res) => {
  try {
    const { barbero, dia, bloques } = req.body;

    let horario = await Horario.findOne({ barbero, dia });

    if (horario) {
      // Actualiza los bloques existentes
      horario.bloques = bloques;
      await horario.save();

      return res.status(200).json({
        message: "Horario actualizado exitosamente",
        horario,
      });
    } else {
      // Crea un nuevo horario
      const nuevoHorario = await Horario.create({ barbero, dia, bloques });

      await Usuario.findByIdAndUpdate(barbero, {
        $push: { horariosDisponibles: nuevoHorario._id },
      });

      const barberoActualizado = await Usuario.findById(barbero).populate(
        "horariosDisponibles"
      );

      return res.status(201).json({
        message: "Horario creado y asignado al barbero exitosamente",
        barbero: barberoActualizado,
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getHorariosByBarbero = async (req, res) => {
  try {
    const { barberoId } = req.params;
    const horarios = await horarioModel.find({ barbero: barberoId });
    if (!horarios) {
      return res
        .status(404)
        .json({ message: "El barbero aún no tiene un horario asignado" });
    }
    res.status(200).json(horarios);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
export const getHorasDisponibles = async (req, res) => {
  try {
    const { id: barberoId } = req.params;
    const { fecha } = req.query; // formato "YYYY-MM-DD"

    if (!fecha) return res.status(400).json({ message: "Fecha requerida" });

    const diaSemana = new Date(fecha).getUTCDay(); // 0=Dom, 6=Sáb
    const usuario = req.usuario;

    // Validar suscripción
    let suscripcionActiva = null;
    if (usuario) {
      suscripcionActiva = await Suscripcion.findOne({
        usuario: usuario.id,
        activa: true,
        fechaInicio: { $lte: new Date() },
        fechaFin: { $gte: new Date() },
      });
    }

    const diasPermitidos = suscripcionActiva ? 31 : 15;
    const limite = dayjs().add(diasPermitidos, "day");

    if (dayjs(fecha).isAfter(limite)) {
      return res.status(400).json({
        message: `No puedes reservar con más de ${diasPermitidos} días de anticipación.`,
        diasPermitidos,
        horasDisponibles: [],
        horasBloqueadas: [],
        horasExtra: [],
      });
    }

    if (diaSemana === 6) {
      const esBarbero = usuario?.rol === "barbero";
      const tieneSuscripcionActiva = !!suscripcionActiva || usuario?.suscrito;

      if (!esBarbero && !tieneSuscripcionActiva) {
        return res.status(403).json({
          message:
            "Las reservas de los sábados son solo para barberos o suscriptores activos",
          horasDisponibles: [],
          horasBloqueadas: [],
          horasExtra: [],
        });
      }
    }

    const barbero = await Usuario.findById(barberoId).populate(
      "horariosDisponibles"
    );
    if (!barbero)
      return res.status(404).json({ message: "Barbero no encontrado" });

    const bloquesDelDia = barbero.horariosDisponibles.filter(
      (h) => Number(h.dia) === diaSemana
    );

    let todasLasHoras = [];
    bloquesDelDia.forEach((horario) => {
      todasLasHoras = todasLasHoras.concat(
        horario.bloques.flatMap(generarHoras)
      );
    });

    const inicioDia = new Date(fecha);
    inicioDia.setUTCHours(0, 0, 0, 0);
    const finDia = new Date(fecha);
    finDia.setUTCHours(23, 59, 59, 999);

    const excepciones = await ExcepcionHorarioModel.find({
      barbero: barberoId,
      fecha: { $gte: inicioDia, $lt: finDia },
    });

    const excepcionesValidas = excepciones.filter((excepcion) => {
      const horaValida =
        typeof excepcion.horaInicio === "string" &&
        excepcion.horaInicio !== "[object Object]" &&
        /^\d{2}:\d{2}$/.test(excepcion.horaInicio);
      if (!horaValida) {
        console.warn(`⚠️ Excepción con horaInicio inválida encontrada:`, {
          id: excepcion._id,
          horaInicio: excepcion.horaInicio,
          tipo: excepcion.tipo,
        });
      }
      return horaValida;
    });

    const horasExtra = excepcionesValidas
      .filter((e) => e.tipo === "extra")
      .map((e) => e.horaInicio);

    const horasBloqueadas = excepcionesValidas
      .filter((e) => e.tipo === "bloqueo")
      .map((e) => e.horaInicio);

    let horasFinales = Array.from(
      new Set([...todasLasHoras, ...horasExtra])
    ).filter((hora) => !horasBloqueadas.includes(hora));

    const reservasDelDia = await Reserva.find({
      barbero: barberoId,
      fecha: { $gte: inicioDia, $lt: finDia },
    });

    horasFinales = horasFinales.filter((hora) => {
      return !reservasDelDia.some((reserva) => {
        const reservaHora = new Date(reserva.fecha).toLocaleTimeString(
          "es-CL",
          {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "America/Santiago",
          }
        );
        return reservaHora === hora;
      });
    });

    // 🔹 FILTRAR HORAS PASADAS SI LA FECHA ES HOY
    const hoy = new Date();
    if (fecha === hoy.toISOString().split("T")[0]) {
      const horaActual = hoy.getHours();
      const minutoActual = hoy.getMinutes();
      horasFinales = horasFinales.filter((hora) => {
        const [h, m] = hora.split(":").map(Number);
        return h > horaActual || (h === horaActual && m > minutoActual);
      });
    }

    // Ordenar
    horasFinales.sort((a, b) => {
      const [hA, mA] = a.split(":").map(Number);
      const [hB, mB] = b.split(":").map(Number);
      return hA - hB || mA - mB;
    });

    horasExtra.sort((a, b) => {
      const [hA, mA] = a.split(":").map(Number);
      const [hB, mB] = b.split(":").map(Number);
      return hA - hB || mA - mB;
    });

    horasBloqueadas.sort((a, b) => {
      const [hA, mA] = a.split(":").map(Number);
      const [hB, mB] = b.split(":").map(Number);
      return hA - hB || mA - mB;
    });

    res.json({
      barbero: barbero.nombre,
      fecha,
      horasDisponibles: horasFinales,
      todasLasHoras: Array.from(
        new Set([...todasLasHoras, ...horasExtra, ...horasBloqueadas])
      ),
      horasBloqueadas,
      horasExtra,
      data: horasFinales,
      diasPermitidos,
    });
  } catch (error) {
    console.error("❌ Error en getHorasDisponibles:", error);
    res.status(500).json({ message: error.message });
  }
};

// 🧹 FUNCIÓN ADICIONAL: Para limpiar datos corruptos
export const limpiarDatosCorruptos = async (req, res) => {
  try {
    // Buscar y eliminar registros con horaInicio corrupta
    const registrosCorruptos = await ExcepcionHorarioModel.find({
      $or: [
        { horaInicio: "[object Object]" },
        { horaInicio: { $type: "object" } },
        { horaInicio: { $not: { $regex: /^\d{2}:\d{2}$/ } } },
      ],
    });

    if (registrosCorruptos.length > 0) {
      const idsCorruptos = registrosCorruptos.map((r) => r._id);
      await ExcepcionHorarioModel.deleteMany({ _id: { $in: idsCorruptos } });

      res.json({
        message: `Se eliminaron ${registrosCorruptos.length} registros corruptos`,
        registrosEliminados: registrosCorruptos,
      });
    } else {
      res.json({ message: "No se encontraron registros corruptos" });
    }
  } catch (error) {
    console.error("❌ Error al limpiar datos:", error);
    res.status(500).json({ message: error.message });
  }
};
