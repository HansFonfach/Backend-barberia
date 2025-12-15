import Reserva from "../models/reserva.model.js";
import excepcionHorarioModel from "../models/excepcionHorario.model.js";
import usuarioModel from "../models/usuario.model.js";
import { generarHoras, formatHora, crearFechasUTC } from "../utils/horas.js"; // 👈 faltaba esto
import suscripcionModel from "../models/suscripcion.model.js";
import dayjs from "dayjs";
import {
  sendReservationEmail,
  sendWaitlistNotificationEmail,
} from "./mailController.js";
import servicioModel from "../models/servicio.model.js";
import notificacionModel from "../models/notificacion.Model.js";

// 🔹 Convierte "HH:mm" a minutos desde medianoche
const horaAminutos = (hora) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};

// 🔹 Convierte Date a minutos UTC desde medianoche
const dateAminutosUTC = (fecha) =>
  fecha.getUTCHours() * 60 + fecha.getUTCMinutes();

/**
 * Obtiene todas las horas disponibles para un barbero en una fecha determinada,
 * considerando sus horarios, excepciones y reservas existentes.
 */
export const obtenerHorasDisponibles = async (
  horariosDelDia,
  excepciones,
  barbero,
  fecha
) => {
  // 1️⃣ Generar horas base del horario normal
  const horasBase = horariosDelDia.flatMap((h) =>
    h.bloques.flatMap(generarHoras)
  );

  // 2️⃣ Procesar horas extra y bloqueadas
  const horasExtra = excepciones
    .filter((e) => e.tipo === "extra")
    .map((e) => e.horaInicio);

  const horasBloqueadas = excepciones
    .filter((e) => e.tipo === "bloqueo")
    .map((e) => e.horaInicio);

  // 3️⃣ Obtener reservas del barbero en esa fecha
  const { startOfDay, endOfDay } = crearFechasUTC(fecha);

  const reservas = await Reserva.find({
    barbero,
    fecha: { $gte: startOfDay, $lte: endOfDay },
  });

  // 4️⃣ Filtrar horas extra ya reservadas usando minutos UTC
  const horasExtraReservadas = reservas
    .map((r) => dateAminutosUTC(r.fecha))
    .filter((minUTC) => horasExtra.some((h) => horaAminutos(h) === minUTC))
    .map((minUTC) => {
      const h = String(Math.floor(minUTC / 60)).padStart(2, "0");
      const m = String(minUTC % 60).padStart(2, "0");
      return `${h}:${m}`;
    });

  // 5️⃣ Combinar y filtrar horas finales
  const horasFinales = Array.from(new Set([...horasBase, ...horasExtra]))
    .filter(
      (h) => !horasBloqueadas.includes(h) && !horasExtraReservadas.includes(h)
    )
    .sort((a, b) => horaAminutos(a) - horaAminutos(b));

  return horasFinales;
};

// 🔹 Validaciones básicas
const validarCamposObligatorios = ({
  barbero,
  servicio,
  fecha,
  hora,
  cliente,
}) => {
  if (!barbero || !servicio || !fecha || !hora || !cliente)
    throw new Error("Todos los campos son obligatorios");
};

const validarSabadino = async (usuarioDoc, diaSemana) => {
  // Solo aplica si es sábado
  if (diaSemana !== 6) return;

  const esBarbero = usuarioDoc.rol === "barbero";
  const esSuscrito = usuarioDoc.suscrito;

  // Busca si tiene una suscripción activa real en la BD
  const suscripcionActiva = await suscripcionModel.findOne({
    usuario: usuarioDoc._id,
    activa: true,
    fechaInicio: { $lte: new Date() },
    fechaFin: { $gte: new Date() },
  });

  const tieneSuscripcionActiva = !!suscripcionActiva || esSuscrito;

  if (!esBarbero && !tieneSuscripcionActiva) {
    throw new Error(
      "Las reservas de los sábados son solo para suscriptores activos o barberos"
    );
  }
};

const verificarDisponibilidadHora = (horaReserva, horasDisponibles) => {
  if (!horasDisponibles.includes(horaReserva))
    throw new Error("Hora no disponible");
};

// 🔹 Verifica conflicto con reservas existentes
const verificarReservaExistente = async (
  barbero,
  fechaObj,
  horaReserva,
  excepciones
) => {
  const esHoraExtra = excepciones.some(
    (e) => e.tipo === "extra" && formatHora(e.horaInicio) === horaReserva
  );
  if (!esHoraExtra) {
    const horaFinReserva = new Date(fechaObj);
    horaFinReserva.setHours(horaFinReserva.getHours() + 1);
    const reservaExistente = await Reserva.findOne({
      barbero,
      fecha: { $gte: fechaObj, $lt: horaFinReserva },
    });
    if (reservaExistente) throw new Error("Hora ya reservada");
  }
};

// 🔹 Controlador principal: Crear una nueva reserva CORREGIDO
export const createReserva = async (req, res) => {
  try {
    const { barbero, servicio, fecha, hora, cliente } = req.body;

    if (!barbero || !servicio || !fecha || !hora || !cliente)
      throw new Error("Todos los campos son obligatorios");

    // ✅ CORRECCIÓN: Crear la fecha en hora de Chile explícitamente
    const fechaCompletaChile = dayjs.tz(
      `${fecha} ${formatHora(hora)}`,
      "YYYY-MM-DD HH:mm",
      "America/Santiago"
    );

    // Convertir a UTC para guardar en DB
    const fechaCompletaUTC = fechaCompletaChile.utc();

    const fechaObj = fechaCompletaUTC.toDate();

    const diaSemana = fechaCompletaChile.day();
    console.log("📅 Día de la semana:", diaSemana);

    // Cliente
    const clienteDoc = await usuarioModel.findById(cliente);
    if (!clienteDoc)
      return res.status(404).json({ message: "Cliente no encontrado" });

    // ✅ Validar rango de días según plan y fecha de suscripción
    const diasPermitidos = clienteDoc.suscrito ? 31 : 15;
    let limite = dayjs().tz("America/Santiago").add(diasPermitidos, "day");



    // Validación sábado
    await validarSabadino(clienteDoc, diaSemana);

    // Barbero
    const barberoDoc = await usuarioModel
      .findById(barbero)
      .populate("horariosDisponibles");
    if (!barberoDoc)
      return res.status(404).json({ message: "Barbero no encontrado" });

    // Horarios del día
    const horariosDelDia = barberoDoc.horariosDisponibles.filter(
      (h) => Number(h.dia) === diaSemana
    );

    // ✅ CORRECCIÓN: Usar las mismas fechas Chile para las búsquedas
    const inicioDiaChile = fechaCompletaChile.startOf("day").toDate();
    const finDiaChile = fechaCompletaChile.endOf("day").toDate();

    // Excepciones (bloqueos y horas extra)
    const excepciones = await excepcionHorarioModel.find({
      barbero,
      fecha: { $gte: inicioDiaChile, $lte: finDiaChile },
    });

    // Horas disponibles
    const horasDisponibles = await obtenerHorasDisponibles(
      horariosDelDia,
      excepciones,
      barbero,
      fecha
    );

    if (!horasDisponibles.includes(formatHora(hora))) {
      throw new Error("Hora no disponible");
    }

    // Verificar conflicto con reservas existentes
    const horaFinReserva = fechaCompletaChile.add(1, "hour").toDate();

    const reservaExistente = await Reserva.findOne({
      barbero,
      fecha: { $gte: fechaObj, $lt: horaFinReserva },
    });

    if (reservaExistente) {
      console.log("❌ Reserva existente encontrada:", reservaExistente);
      throw new Error("Hora ya reservada");
    }

    const servicioDoc = await servicioModel.findById(servicio);

    if (!servicioDoc) {
      return res.status(400).json({ message: "Servicio no existe" });
    }

    // Crear reserva
    const nuevaReserva = await Reserva.create({
      cliente,
      barbero,
      servicio,
      fecha: fechaObj,
      estado: "pendiente",
    });


    // 🔥 DESCONTAR SERVICIO SI TIENE SUSCRIPCIÓN ACTIVA
    const suscripcion = await suscripcionModel.findOne({
      usuario: cliente,
      activa: true,
      fechaInicio: { $lte: new Date() },
      fechaFin: { $gte: new Date() },
    });

    if (suscripcion) {
      // 👇 Se descuenta SOLO si todavía tiene servicios gratis disponibles
      if (suscripcion.serviciosUsados < suscripcion.serviciosTotales) {
        suscripcion.serviciosUsados += 1;
        await suscripcion.save();
      }
    }

    // 👌 Recién ahora mandamos la respuesta
    res.status(201).json({
      ...nuevaReserva.toObject(),
      fechaChile: fechaCompletaChile.format("YYYY-MM-DD HH:mm"),
    });

    const nombreServicio = servicioDoc.nombre;

    await sendReservationEmail(clienteDoc.email, {
      nombreCliente: clienteDoc.nombre,
      nombreBarbero: barberoDoc.nombre,
      fecha: fechaCompletaChile.format("YYYY-MM-DD"),
      hora: formatHora(hora),
      servicio: nombreServicio,
    });
  } catch (error) {
    console.error("❌ Error en createReserva:", error);
    const statusCode = error.message.includes("no encontrado")
      ? 404
      : error.message.includes("sábado")
      ? 403
      : error.message.includes("disponible") ||
        error.message.includes("reservada")
      ? 400
      : 500;

    res
      .status(statusCode)
      .json({ message: error.message || "Error al crear la reserva" });
  }
};

export const getReservas = async (req, res) => {
  try {
    const reservas = await Reserva.find();
    res.json(reservas);
  } catch (error) {}
};

export const getReservasByUserId = async (req, res) => {
  try {
    // el id lo sacas del token (req.user.id) en lugar de params
    const userId = req.usuario.id; // este viene del token JWT

    // buscar todas las reservas de ese usuario
    const reservas = await Reserva.find({ cliente: userId })
      .populate("barbero", "nombre apellido suscrito")
      .populate("servicio", "nombre duracion precio")
      .sort({ fecha: 1 }); // ordenadas por fecha

    res.json({ reservas });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getReservasByBarberId = async (req, res) => {
  try {
    const barberId = req.usuario.id;
    const hoy = new Date();
    const inicio = new Date(hoy.setHours(0, 0, 0, 0));
    const fin = new Date(hoy.setHours(23, 59, 59, 999));

    const reservas = await Reserva.find({
      barbero: barberId,
      fecha: { $gte: inicio, $lte: fin },
    })
      .populate("cliente", "nombre apellido telefono") // Trae solo nombre y apellido del cliente
      .populate("servicio", "nombre") // Trae solo nombre del servicio
      .sort({ fecha: 1 }); // Ordena por fecha ascendente
    console.log(reservas);
    return res.json({ reservas });
  } catch (error) {
    console.error("Error al obtener reservas por barbero:", error);
    return res.status(500).json({ message: "Error al obtener reservas" });
  }
};
export const postDeleteReserva = async (req, res) => {
  try {
    const { id } = req.params;
    console.log("📌 Cancelando reserva con ID:", id);

    const existeReserva = await Reserva.findById(id);
    if (!existeReserva) {
      return res
        .status(404)
        .json({ message: "No se ha encontrado la reserva." });
    }
    console.log("✅ Reserva encontrada:", existeReserva);

    // Eliminar la reserva
    await Reserva.findByIdAndDelete(id);
    console.log("✅ Reserva eliminada");

    // ────────────────────────────────
    // Buscar notificaciones pendientes
    // ────────────────────────────────
    const notificaciones = await notificacionModel
      .find({
        barberoId: existeReserva.barbero, // usar el campo correcto
        fecha: existeReserva.fecha,
        enviado: false,
      })
      .populate("usuarioId");

    console.log("📢 Notificaciones encontradas:", notificaciones.length);

    // ────────────────────────────────
    // Enviar correos y marcar como enviado
    // ────────────────────────────────
    await Promise.all(
      notificaciones.map(async (noti) => {
        if (noti.usuarioId?.email) {
          await sendWaitlistNotificationEmail(noti.usuarioId.email, {
            nombreCliente: noti.usuarioId.nombre,
            nombreBarbero: "Nombre del Barbero", // o extraer del modelo Barbero
            fecha: noti.fecha.toLocaleDateString(),
            hora: noti.fecha.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          });
        }
        noti.enviado = true;
        await noti.save();
      })
    );

    res.status(200).json({
      message: "Reserva eliminada y notificaciones enviadas",
      reserva: existeReserva,
      notificacionesEnviadas: notificaciones.length,
    });
  } catch (error) {
    console.error("Error al eliminar reserva:", error);
    res
      .status(500)
      .json({ message: "Error del servidor al eliminar la reserva." });
  }
};

export const getReservasActivas = async (req, res) => {
  try {
    const { userId } = req.params;

    const usuario = await usuarioModel.findById(userId);
    if (!usuario)
      return res.status(404).json({ message: "No se encuentró el usuario." });

    const now = new Date();

    const reservasActivas = await Reserva.countDocuments({
      cliente: userId,
      estado: { $in: ["pendiente", "confirmada"] },
      fecha: { $gte: now }, // 👈 SOLO RESERVAS FUTURAS
    });

    res.json({
      success: true,
      reservasActivas,
      maxReservas: usuario.maxReservas,
      plan: usuario.plan,
      puedeReservar: reservasActivas < usuario.maxReservas,
      restantes: Math.max(usuario.maxReservas - reservasActivas, 0),
    });
  } catch (error) {
    console.error("Error al obtener reservas activas:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener reservas activas",
    });
  }
};
export const getReservasPorFechaBarbero = async (req, res) => {
  try {
    const { fecha } = req.query;
    const barberoId = req.usuario.id;

    const inicioDia = new Date(fecha + "T00:00:00");
    const finDia = new Date(fecha + "T23:59:59");

    // 1. Obtener todas las reservas del día
    const reservas = await Reserva.find({
      barbero: barberoId,
      fecha: { $gte: inicioDia, $lte: finDia },
    })
      .populate("cliente", "nombre apellido telefono")
      .populate("servicio", "nombre")
      .sort({ fecha: 1 });

    // 2. Procesar cada reserva para incluir posición dentro de la suscripción
    const reservasConInfo = await Promise.all(
      reservas.map(async (reserva) => {
        const clienteId = reserva.cliente?._id;
        if (!clienteId) return reserva;

        // Buscar suscripción activa para esta fecha
        const sus = await suscripcionModel.findOne({
          usuario: clienteId,
          activa: true,
          fechaInicio: { $lte: reserva.fecha },
          fechaFin: { $gte: reserva.fecha },
        });

        if (!sus) {
          return {
            ...reserva.toObject(),
            suscripcion: null,
          };
        }

        // Reservas que el cliente ha hecho dentro del periodo de la suscripción
        const reservasDelCliente = await Reserva.find({
          cliente: clienteId,
          fecha: { $gte: sus.fechaInicio, $lte: reserva.fecha },
        }).sort({ fecha: 1 });

        // Posición EXACTA en la suscripción (1, 2, 3…)
        const posicion =
          reservasDelCliente.findIndex(
            (r) => r._id.toString() === reserva._id.toString()
          ) + 1;

        return {
          ...reserva.toObject(),
          suscripcion: {
            posicion,
            limite: sus.serviciosTotales,
          },
        };
      })
    );

    res.json({ reservas: reservasConInfo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener reservas por fecha" });
  }
};
