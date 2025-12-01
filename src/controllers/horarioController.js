import Horario from "../models/horario.model.js";
import Usuario from "../models/usuario.model.js";
import Reserva from "../models/reserva.model.js";
import { generarHoras } from "../utils/horas.js";
import Suscripcion from "../models/suscripcion.model.js";
import ExcepcionHorarioModel from "../models/excepcionHorario.model.js";
import horarioModel from "../models/horario.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import {
  verificarFeriadoConComportamiento,
  determinarVistaSegunFeriado,
  bloquearFeriado,
} from "../utils/feriados.js";
dayjs.extend(utc);
dayjs.extend(timezone);

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
// controllers/horas.controller.js

export const getHorasDisponibles = async (req, res) => {
  try {
    const { id: barberoId } = req.params;
    const { fecha } = req.query;
    const usuario = req.usuario;

    if (!fecha) return res.status(400).json({ message: "Fecha requerida" });

    // Hora actual en Chile
    const ahoraChile = dayjs().tz("America/Santiago");
    const fechaConsulta = dayjs.tz(fecha, "YYYY-MM-DD", "America/Santiago");
    const diaSemana = fechaConsulta.day();

    // --- VERIFICAR FERIADO ---
    const feriado = await verificarFeriadoConComportamiento(fecha);

    // Verificar si hay excepciones creadas por el barbero para este feriado
    let hayExcepcionesBarbero = false;
    if (feriado) {
      const inicioDiaUTC = fechaConsulta.utc().startOf("day").toDate();
      const finDiaUTC = fechaConsulta.utc().endOf("day").toDate();

      const excepcionesBarbero = await ExcepcionHorarioModel.find({
        barbero: barberoId,
        fecha: { $gte: inicioDiaUTC, $lt: finDiaUTC },
        $or: [
          {
            tipo: "bloqueo",
            motivo: { $ne: `Feriado automático: ${feriado.nombre}` },
          },
          { tipo: "extra" },
        ],
      });

      hayExcepcionesBarbero = excepcionesBarbero.length > 0;
    }

    const vistaFeriado = determinarVistaSegunFeriado(
      feriado,
      usuario,
      hayExcepcionesBarbero
    );

    // Respuesta base
    const respuestaBase = {
      barbero: null,
      fecha: fechaConsulta.format("YYYY-MM-DD"),
      horasDisponibles: [],
      todasLasHoras: [],
      horasBloqueadas: [],
      horasExtra: [],
      data: [],
      diasPermitidos: usuario?.suscrito ? 31 : 15,
      esFeriado: vistaFeriado.esFeriado,
      nombreFeriado: feriado?.nombre || null,
      mensaje: vistaFeriado.mensaje,
    };

    // CASO 1: Cliente viendo feriado bloqueado o sin excepciones
    if (vistaFeriado.esFeriado && !vistaFeriado.mostrarHoras) {
      return res.status(200).json(respuestaBase);
    }

    // CASO 2: Barbero viendo feriado
    if (vistaFeriado.esFeriado && usuario?.rol === "barbero") {
      const barbero = await Usuario.findById(barberoId).populate(
        "horariosDisponibles"
      );
      if (!barbero)
        return res.status(404).json({ message: "Barbero no encontrado" });

      // Aplicar bloqueo automático si el feriado es "bloquear_todo"
      let horasBloqueadasFeriado = [];
      if (feriado.comportamiento === "bloquear_todo") {
        horasBloqueadasFeriado = await bloquearFeriado(
          barberoId,
          fechaConsulta,
          barbero.horariosDisponibles
        );
      }

      const bloquesDelDia = barbero.horariosDisponibles.filter(
        (h) => Number(h.dia) === diaSemana
      );

      let todasLasHoras = [];
      bloquesDelDia.forEach((horario) => {
        todasLasHoras = todasLasHoras.concat(
          horario.bloques.flatMap(generarHoras)
        );
      });

      // Obtener excepciones ya existentes (no las del feriado automático)
      const inicioDiaUTC = fechaConsulta.utc().startOf("day").toDate();
      const finDiaUTC = fechaConsulta.utc().endOf("day").toDate();

      const excepciones = await ExcepcionHorarioModel.find({
        barbero: barberoId,
        fecha: { $gte: inicioDiaUTC, $lt: finDiaUTC },
        motivo: { $ne: `Feriado automático: ${feriado.nombre}` },
      });

      const horasExtra = excepciones
        .filter((e) => e.tipo === "extra")
        .map((e) => e.horaInicio);

      const horasBloqueadasManual = excepciones
        .filter((e) => e.tipo === "bloqueo")
        .map((e) => e.horaInicio);

      // Combinar bloqueos de feriado con bloqueos manuales
      const todasHorasBloqueadas = [
        ...new Set([...horasBloqueadasFeriado, ...horasBloqueadasManual]),
      ];

      return res.status(200).json({
        ...respuestaBase,
        barbero: barbero.nombre,
        todasLasHoras: [...new Set([...todasLasHoras, ...horasExtra])].sort(),
        horasBloqueadas: todasHorasBloqueadas.sort(),
        horasExtra: horasExtra.sort(),
        message: vistaFeriado.mensaje,
      });
    }

    // --- VALIDAR SUSCRIPCIÓN (solo si no es feriado bloqueado) ---
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
    const limite = ahoraChile.add(diasPermitidos, "day");

    if (fechaConsulta.isAfter(limite, "day")) {
      return res.status(400).json({
        message: `No puedes reservar con más de ${diasPermitidos} días de anticipación.`,
        diasPermitidos,
        horasDisponibles: [],
        horasBloqueadas: [],
        horasExtra: [],
      });
    }

    // --- Validar sábado para no suscriptores ---
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

    // --- CONTINUAR CON LÓGICA NORMAL ---
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

    // Si es feriado con comportamiento "bloquear_todo", aplicar bloqueo automático
    let horasBloqueadasFeriado = [];
    if (feriado && feriado.comportamiento === "bloquear_todo") {
      horasBloqueadasFeriado = await bloquearFeriado(
        barberoId,
        fechaConsulta,
        barbero.horariosDisponibles
      );
    }

    const excepciones = await ExcepcionHorarioModel.find({
      barbero: barberoId,
      fecha: {
        $gte: fechaConsulta.startOf("day").toDate(),
        $lt: fechaConsulta.endOf("day").toDate(),
      },
    });

    const excepcionesValidas = excepciones.filter(
      (excepcion) =>
        typeof excepcion.horaInicio === "string" &&
        /^\d{2}:\d{2}$/.test(excepcion.horaInicio)
    );

    const horasExtra = excepcionesValidas
      .filter((e) => e.tipo === "extra")
      .map((e) => e.horaInicio);

    const horasBloqueadasManual = excepcionesValidas
      .filter((e) => e.tipo === "bloqueo")
      .map((e) => e.horaInicio);

    // Combinar bloqueos de feriado con bloqueos manuales
    const todasHorasBloqueadas = [
      ...new Set([...horasBloqueadasFeriado, ...horasBloqueadasManual]),
    ];

    const reservasDelDia = await Reserva.find({
      barbero: barberoId,
      fecha: {
        $gte: fechaConsulta.startOf("day").toDate(),
        $lt: fechaConsulta.endOf("day").toDate(),
      },
    });

    let horasFinales = Array.from(new Set([...todasLasHoras, ...horasExtra]))
      .filter((hora) => !todasHorasBloqueadas.includes(hora))
      .filter((hora) => {
        return !reservasDelDia.some((reserva) => {
          const fechaReservaChile = dayjs(reserva.fecha).tz("America/Santiago");
          const horaReserva = fechaReservaChile.format("HH:mm");
          return horaReserva === hora;
        });
      });

    // --- Filtrar horas pasadas si es hoy ---
    if (fechaConsulta.isSame(ahoraChile, "day")) {
      const horaActual = ahoraChile.hour();
      const minutoActual = ahoraChile.minute();
      horasFinales = horasFinales.filter((hora) => {
        const [h, m] = hora.split(":").map(Number);
        return h > horaActual || (h === horaActual && m > minutoActual);
      });
    }

    const ordenarHoras = (arr) =>
      arr.sort((a, b) => {
        const [hA, mA] = a.split(":").map(Number);
        const [hB, mB] = b.split(":").map(Number);
        return hA - hB || mA - mB;
      });

    horasFinales = ordenarHoras(horasFinales);
    ordenarHoras(horasExtra);
    ordenarHoras(todasHorasBloqueadas);

    res.json({
      barbero: barbero.nombre,
      fecha: fechaConsulta.format("YYYY-MM-DD"),
      horasDisponibles: horasFinales,
      todasLasHoras: Array.from(
        new Set([...todasLasHoras, ...horasExtra, ...todasHorasBloqueadas])
      ),
      horasBloqueadas: todasHorasBloqueadas,
      horasExtra: horasExtra,
      data: horasFinales,
      diasPermitidos,
      esFeriado: vistaFeriado.esFeriado,
      nombreFeriado: feriado?.nombre || null,
      mensaje: vistaFeriado.mensaje || null,
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
