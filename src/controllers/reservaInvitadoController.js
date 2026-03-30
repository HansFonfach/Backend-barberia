import empresaModel from "../models/empresa.model.js";
import usuarioModel from "../models/usuario.model.js";
import { createReserva } from "./reservaController.js";
import accesTokenModel from "../models/accesToken.model.js";
import Reserva from "../models/reserva.model.js";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export const reservarComoInvitado = async (req, res) => {
  const { slug } = req.params;
  const { nombre, apellido, rut, email, telefono } = req.body;

  const empresa = await empresaModel.findOne({ slug });
  if (!empresa)
    return res.status(404).json({ message: "Empresa no encontrada" });

  let usuario = await usuarioModel.findOne({
    email,
    empresa: empresa._id,
  });

  if (!usuario) {
    usuario = await usuarioModel.create({
      nombre,
      apellido,
      rut,
      email,
      telefono,
      rol: "invitado",
      empresa: empresa._id,
    });
  }

  req.usuario = {
    id: usuario._id,
    empresaId: empresa._id,
    rol: usuario.rol,
  };

  req.crearTokenCancelacion = true; // 👈 aquí, antes de llamar

  return createReserva(req, res);
};

export const cancelarReservaPorLink = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        message: "Token requerido",
      });
    }

    /* =============================
       1️⃣ VALIDAR TOKEN
    ============================== */
    const accessToken = await accesTokenModel.findOne({
      token,
      tipo: "reserva",
      expiraEn: { $gt: new Date() },
    });

    if (!accessToken) {
      return res.status(400).json({
        message: "Link inválido o expirado",
      });
    }

    /* =============================
       2️⃣ VERIFICAR RESERVA
    ============================== */
    const reserva = await Reserva.findOne({
      _id: accessToken.reserva,
      estado: { $in: ["pendiente", "confirmada"] },
    }).populate("barbero servicio empresa"); // 👈 IMPORTANTE

    if (!reserva) {
      return res.status(404).json({
        message: "La reserva no existe o ya fue cancelada",
      });
    }

    /* =============================
       3️⃣ REGLAS CANCELACIÓN (EMPRESA)
    ============================== */
    const ahoraChile = dayjs().tz("America/Santiago");
    const inicioReservaChile = dayjs(reserva.fecha).tz("America/Santiago");

    const empresaDoc = reserva.empresa;

    const permiteCancelacion =
      empresaDoc?.politicaCancelacion?.permiteCancelacion ?? true;

    const horasLimite = empresaDoc?.politicaCancelacion?.horasLimite ?? 24;

    // Diferencia en minutos (más preciso)
    const minutosDiff = inicioReservaChile.diff(ahoraChile, "minute");

    // ❌ Empresa no permite cancelar
    if (!permiteCancelacion) {
      return res.status(403).json({
        message: "Esta empresa no permite cancelar reservas",
      });
    }

    // ❌ Reserva ya pasó
    if (minutosDiff < 0) {
      return res.status(403).json({
        message: "No puedes cancelar una reserva que ya pasó",
      });
    }

    // ❌ No cumple política de anticipación
    if (minutosDiff < horasLimite * 60) {
      const horasRestantes = Math.floor(minutosDiff / 60);

      return res.status(403).json({
        message: `Debes cancelar con al menos ${horasLimite} horas de anticipación. Te quedan ${horasRestantes} horas`,
      });
    }

    /* =============================
       4️⃣ CANCELAR
    ============================== */
    reserva.estado = "cancelada";
    reserva.canceladaEn = new Date();
    reserva.canceladaPor = "cliente";

    await reserva.save();

    /* =============================
       5️⃣ INVALIDAR TOKEN
    ============================== */
    await accesTokenModel.deleteOne({ _id: accessToken._id });

    return res.json({
      message: "Reserva cancelada correctamente",
      reservaId: reserva._id,
    });
  } catch (error) {
    console.error("❌ cancelarReservaPorLink:", error);
    return res.status(500).json({
      message: "Error al cancelar la reserva",
    });
  }
};

export const getReservaInfoPorToken = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ message: "Token requerido" });
    }

    const accessToken = await accesTokenModel.findOne({ token }); // 👈

    if (!accessToken) {
      return res
        .status(404)
        .json({ message: "Link inválido", code: "INVALID" });
    }

    if (accessToken.expiraEn < new Date()) {
      return res
        .status(410)
        .json({ message: "Este link ha expirado", code: "EXPIRED" });
    }

    const reserva = await Reserva.findById(accessToken.reserva) // 👈
      .populate("empresa", "nombre")
      .populate("servicio", "nombre duracion")
      .populate("barbero", "nombre apellido");

    if (!reserva) {
      return res.status(404).json({ message: "Reserva no encontrada" });
    }

    if (["cancelada", "atendida"].includes(reserva.estado)) {
      return res.status(409).json({
        message: `La reserva ya fue ${reserva.estado}`,
        code: "INVALID_STATE",
      });
    }

    return res.json({
      empresa: reserva.empresa.nombre,
      fecha: reserva.fecha,
      servicio: reserva.servicio.nombre,
      duracion: reserva.servicio.duracion,
      barbero: `${reserva.barbero.nombre} ${reserva.barbero.apellido}`,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Error al obtener información de la reserva" });
  }
};
