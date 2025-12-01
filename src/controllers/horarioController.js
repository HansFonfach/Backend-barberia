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
export const getHorasDisponibles = async (req, res) => {
  try {
    const { id: barberoId } = req.params;
    const { fecha } = req.query;
    const usuario = req.usuario;

    if (!fecha) return res.status(400).json({ message: "Fecha requerida" });

    // Hora actual en Chile
    const ahoraChile = dayjs().tz("America/Santiago");

    // Fecha del día solicitado en Chile
    const fechaConsulta = dayjs.tz(fecha, "YYYY-MM-DD", "America/Santiago");
    const diaSemana = fechaConsulta.day();

    // --- VERIFICAR FERIADO ---
    const feriado = await verificarFeriadoConComportamiento(fecha);

    // Respuesta base para todos los casos
    const respuestaBase = {
      barbero: null,
      fecha: fechaConsulta.format("YYYY-MM-DD"),
      horasDisponibles: [],
      todasLasHoras: [],
      horasBloqueadas: [],
      horasExtra: [],
      data: [],
      diasPermitidos: usuario?.suscrito ? 31 : 15,
      esFeriado: !!feriado,
      nombreFeriado: feriado?.nombre || null,
      comportamientoFeriado: feriado?.comportamiento || null,
    };

    // --- CASO ESPECIAL: BARBERO VIENDO FERIADO ---
    if (feriado && usuario?.rol === "barbero") {
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

      // Obtener excepciones ya existentes
      const inicioDiaUTC = fechaConsulta.utc().startOf("day").toDate();
      const finDiaUTC = fechaConsulta.utc().endOf("day").toDate();

      const excepciones = await ExcepcionHorarioModel.find({
        barbero: barberoId,
        fecha: { $gte: inicioDiaUTC, $lt: finDiaUTC },
      });

      const horasExtra = excepciones
        .filter((e) => e.tipo === "extra")
        .map((e) => e.horaInicio);

      const horasBloqueadasManual = excepciones
        .filter((e) => e.tipo === "bloqueo")
        .map((e) => e.horaInicio);

      // Ordenar función
      const ordenarHoras = (arr) =>
        arr.sort((a, b) => {
          const [hA, mA] = a.split(":").map(Number);
          const [hB, mB] = b.split(":").map(Number);
          return hA - hB || mA - mB;
        });

      // FERIADO "BLOQUEAR_TODO"
      if (feriado.comportamiento === "bloquear_todo") {
        // Para feriado "bloquear_todo", TODAS las horas base aparecen bloqueadas
        // excepto las que ya fueron desbloqueadas manualmente

        // Horas que ya fueron desbloqueadas (tienen registro de bloqueo manual)
        const horasYaDesbloqueadas = horasBloqueadasManual;

        // Todas las horas base están bloqueadas por feriado
        const horasBloqueadasPorFeriado = todasLasHoras.filter(
          (hora) => !horasYaDesbloqueadas.includes(hora)
        );

        // Combinar bloqueos
        const todasHorasBloqueadas = [
          ...new Set([...horasBloqueadasPorFeriado, ...horasBloqueadasManual]),
        ];

        return res.status(200).json({
          ...respuestaBase,
          barbero: barbero.nombre,
          todasLasHoras: ordenarHoras([
            ...new Set([...todasLasHoras, ...horasExtra]),
          ]),
          horasBloqueadas: ordenarHoras(todasHorasBloqueadas), // ← TODAS bloqueadas
          horasExtra: ordenarHoras(horasExtra),
          horasDisponibles: [], // ← VACÍO, ninguna disponible inicialmente
          message: `FERIADO: ${feriado.nombre}. Todas las horas aparecen bloqueadas. Haz clic en "Reactivar" para habilitar las que quieras trabajar.`,
          metadata: {
            esBarberoViendoFeriado: true,
            comportamientoFeriado: "bloquear_todo",
            totalHorasBase: todasLasHoras.length,
            horasBloqueadasPorFeriado: horasBloqueadasPorFeriado.length,
            horasYaDesbloqueadas: horasYaDesbloqueadas.length,
          },
        });
      }

      // FERIADO "PERMITIR_EXCEPCIONES"
      if (feriado.comportamiento === "permitir_excepciones") {
        // Para "permitir_excepciones", lógica normal
        const horasDisponibles = todasLasHoras.filter(
          (hora) => !horasBloqueadasManual.includes(hora)
        );

        return res.status(200).json({
          ...respuestaBase,
          barbero: barbero.nombre,
          todasLasHoras: ordenarHoras([
            ...new Set([...todasLasHoras, ...horasExtra]),
          ]),
          horasBloqueadas: ordenarHoras(horasBloqueadasManual),
          horasExtra: ordenarHoras(horasExtra),
          horasDisponibles: ordenarHoras(horasDisponibles),
          message: `FERIADO: ${feriado.nombre}. Horas normales, pero recuerda que es feriado.`,
        });
      }
    }

    // --- CASO: CLIENTE VIENDO FERIADO ---
    if (feriado && usuario?.rol !== "barbero") {
      // Para clientes, verificar si hay horas habilitadas
      const inicioDiaUTC = fechaConsulta.utc().startOf("day").toDate();
      const finDiaUTC = fechaConsulta.utc().endOf("day").toDate();

      const excepcionesCliente = await ExcepcionHorarioModel.find({
        barbero: barberoId,
        fecha: { $gte: inicioDiaUTC, $lt: finDiaUTC },
        tipo: "bloqueo", // Solo bloqueos manuales (no del feriado automático)
      });

      // Si es feriado "bloquear_todo" y no hay excepciones, mostrar vacío
      if (
        feriado.comportamiento === "bloquear_todo" &&
        excepcionesCliente.length === 0
      ) {
        return res.status(200).json({
          ...respuestaBase,
          message: `Feriado nacional: ${feriado.nombre}. No hay atención este día.`,
        });
      }

      // Si es feriado "permitir_excepciones" y no hay excepciones, mostrar mensaje
      if (
        feriado.comportamiento === "permitir_excepciones" &&
        excepcionesCliente.length === 0
      ) {
        return res.status(200).json({
          ...respuestaBase,
          message: `Feriado: ${feriado.nombre}. No hay horas habilitadas para este día.`,
        });
      }

      // Si hay excepciones (barbero habilitó horas), continuar con flujo normal
    }

    // --- VALIDAR SUSCRIPCIÓN (continúa solo si no es feriado bloqueado) ---
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
        esFeriado: !!feriado,
        nombreFeriado: feriado?.nombre || null,
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
          esFeriado: !!feriado,
        });
      }
    }

    // --- OBTENER HORARIOS DEL BARBERO (flujo normal) ---
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

    // Convertir fecha de consulta a inicio y fin del día en UTC
    const inicioDiaUTC = fechaConsulta.startOf("day").utc().toDate();
    const finDiaUTC = fechaConsulta.endOf("day").utc().toDate();

    const excepciones = await ExcepcionHorarioModel.find({
      barbero: barberoId,
      fecha: {
        $gte: inicioDiaUTC,
        $lt: finDiaUTC,
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

    const horasBloqueadas = excepcionesValidas
      .filter((e) => e.tipo === "bloqueo")
      .map((e) => e.horaInicio);

    const reservasDelDia = await Reserva.find({
      barbero: barberoId,
      fecha: {
        $gte: fechaConsulta.startOf("day").toDate(),
        $lt: fechaConsulta.endOf("day").toDate(),
      },
    });

    let horasFinales = Array.from(new Set([...todasLasHoras, ...horasExtra]))
      .filter((hora) => !horasBloqueadas.includes(hora))
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
    ordenarHoras(horasBloqueadas);

    res.json({
      barbero: barbero.nombre,
      fecha: fechaConsulta.format("YYYY-MM-DD"),
      horasDisponibles: horasFinales,
      todasLasHoras: Array.from(
        new Set([...todasLasHoras, ...horasExtra, ...horasBloqueadas])
      ),
      horasBloqueadas: horasBloqueadas,
      horasExtra: horasExtra,
      data: horasFinales,
      diasPermitidos,
      esFeriado: !!feriado,
      nombreFeriado: feriado?.nombre || null,
      comportamientoFeriado: feriado?.comportamiento || null,
      message: feriado ? `Feriado: ${feriado.nombre}` : null,
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
