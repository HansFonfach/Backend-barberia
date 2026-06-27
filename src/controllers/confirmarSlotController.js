import jwt from "jsonwebtoken";
import reservaModel from "../models/reserva.model.js";
import servicioModel from "../models/servicio.model.js";
import barberoServicioModel from "../models/barberoServicio.model.js";
import ExcepcionHorarioModel from "../models/excepcionHorario.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "America/Santiago";

// GET /api/reservas/confirmar-slot?token=xxx
// Devuelve los datos del slot para mostrar en el frontend
export const obtenerDatosSlot = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ message: "Token requerido" });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ message: "El enlace expiró o no es válido" });
    }

    const { clienteId, servicioId, barberoId, empresaId, fecha, hora } = payload;

    // Verificar que el slot sigue disponible
    const fechaDayjs = dayjs(fecha).tz(TZ);
    const servicio = await servicioModel.findById(servicioId).select("nombre duracionMin precio");
    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado" });

    const duracion = servicio.duracionMin || 30;
    const finSlot = fechaDayjs.add(duracion, "minute");

    const conflicto = await reservaModel.findOne({
      barbero: barberoId,
      estado: { $in: ["pendiente", "confirmada"] },
      fecha: { $lt: finSlot.utc().toDate() },
      $expr: {
        $gt: [
          { $add: ["$fecha", { $multiply: ["$duracion", 60000] }] },
          fechaDayjs.utc().toDate(),
        ],
      },
    });

    return res.json({
      disponible: !conflicto,
      datos: {
        fecha: fechaDayjs.format("dddd D [de] MMMM, YYYY"),
        hora,
        servicio: servicio.nombre,
        precio: servicio.precio,
        duracion,
      },
      token, // el frontend lo reenvía al confirmar
    });
  } catch (error) {
    console.error("Error obteniendo datos del slot:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

// POST /api/reservas/confirmar-slot
// Crea la reserva con los datos del token
export const confirmarSlotDesdeToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "Token requerido" });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ message: "El enlace expiró o no es válido" });
    }

    const { clienteId, servicioId, barberoId, empresaId, fecha } = payload;

    const servicio = await servicioModel.findById(servicioId).select("nombre duracionMin precio");
    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado" });

    const fechaDayjs = dayjs(fecha).tz(TZ);
    const duracion = servicio.duracionMin || 30;
    const finSlot = fechaDayjs.add(duracion, "minute");

    // Verificar disponibilidad de nuevo antes de crear
    const conflicto = await reservaModel.findOne({
      barbero: barberoId,
      estado: { $in: ["pendiente", "confirmada"] },
      fecha: { $lt: finSlot.utc().toDate() },
      $expr: {
        $gt: [
          { $add: ["$fecha", { $multiply: ["$duracion", 60000] }] },
          fechaDayjs.utc().toDate(),
        ],
      },
    });

    if (conflicto) {
      return res.status(409).json({
        success: false,
        message: "Lo sentimos, ese horario ya fue reservado. Por favor agenda manualmente.",
      });
    }

    // Snapshot del servicio
    const barberoServicio = await barberoServicioModel.findOne({
      barbero: barberoId,
      servicio: servicioId,
      activo: true,
    });

    const nuevaReserva = await reservaModel.create({
      empresa: empresaId,
      cliente: clienteId,
      barbero: barberoId,
      servicio: servicioId,
      fecha: fechaDayjs.utc().toDate(),
      duracion,
      estado: "confirmada", // viene pre-confirmada desde el correo
      servicioSnapshot: {
        nombre: servicio.nombre,
        precio: barberoServicio?.precio || servicio.precio,
        duracion,
      },
      totalServicio: barberoServicio?.precio || servicio.precio,
      totalFinal: barberoServicio?.precio || servicio.precio,
    });

    return res.json({
      success: true,
      message: "¡Reserva confirmada!",
      reservaId: nuevaReserva._id,
      datos: {
        fecha: fechaDayjs.format("dddd D [de] MMMM, YYYY"),
        hora: fechaDayjs.format("HH:mm"),
        servicio: servicio.nombre,
      },
    });
  } catch (error) {
    console.error("Error confirmando slot:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};