// controllers/suscripcion.controller.js
import Suscripcion from "../models/suscripcion.model.js";
import Usuario from "../models/usuario.model.js";

export const crearSuscripcion = async (req, res) => {
  try {
    const { id } = req.params;

    const count = await Suscripcion.countDocuments({ activa: true });
    if (count >= 20) {
      return res.status(400).json({
        message: "Ya se alcanzó el límite máximo de suscripciones activas.",
      });
    }

    const usuario = await Usuario.findById(id);
    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado.",
      });
    }

    const suscripcionActiva = await Suscripcion.findOne({
      usuario: id,
      activa: true,
    });

    if (suscripcionActiva) {
      return res.status(409).json({
        success: false,
        message: "El usuario ya tiene una suscripción activa.",
      });
    }

    const fechaInicio = new Date();
    const fechaFin = new Date();
    fechaFin.setMonth(fechaFin.getMonth() + 1);

    const nuevaSuscripcion = new Suscripcion({
      usuario: id,
      activa: true,
      fechaInicio,
      fechaFin,
      historial: false,

      // 🔥 IMPORTANTE: inicializamos los servicios
      serviciosTotales: 2,
      serviciosUsados: 0,
    });

    await nuevaSuscripcion.save();

    await Usuario.findByIdAndUpdate(id, { suscrito: true });

    return res.status(201).json({
      success: true,
      message: "Suscripción creada correctamente.",
      data: {
        suscripcion: nuevaSuscripcion,
      },
    });
  } catch (error) {
    console.error("Error al crear suscripción:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "Error: Ya existe una suscripción para este usuario. Por favor contacte al administrador.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error interno del servidor al crear la suscripción.",
    });
  }
};

export const cancelarSuscripcion = async (req, res) => {
  try {
    const { id } = req.params;

    // Buscar suscripción activa
    const suscripcion = await Suscripcion.findOne({
      usuario: id,
      activa: true,
    });

    if (!suscripcion) {
      return res.status(404).json({
        success: false,
        message: "No se encontró una suscripción activa para este usuario.",
      });
    }

    // Cancelar suscripción
    suscripcion.activa = false;
    suscripcion.historial = true;
    suscripcion.fechaFin = new Date();
    await suscripcion.save();

    // Actualizar usuario
    await Usuario.findByIdAndUpdate(id, { suscrito: false });

    return res.status(200).json({
      success: true,
      message: "Suscripción cancelada correctamente.",
    });
  } catch (error) {
    console.error("Error al cancelar suscripción:", error);

    return res.status(500).json({
      success: false,
      message: "Error interno del servidor al cancelar la suscripción.",
    });
  }
};

export const estadoSuscripcionCliente = async (req, res) => {
  try {
    const { userId} = req.params;

    const suscripcion = await Suscripcion.findOne({
      usuario: userId,
      activa: true,
    });

    if (!suscripcion) {
      return res.json({ activa: false, msg: "Usuario sin suscripción" });
    }

    const restantes =
      suscripcion.serviciosTotales - suscripcion.serviciosUsados;

    return res.json({
      activa: true,
      serviciosTotales: suscripcion.serviciosTotales,
      serviciosUsados: suscripcion.serviciosUsados,
      restantes,
      cobrar: restantes <= 0,
    });
  } catch (error) {
    res.status(500).json({ msg: "Error" });
  }
};

export const registrarUsoServicio = async (req, res) => {
  try {
    const { usuarioId } = req.body;

    const suscripcion = await Suscripcion.findOne({
      usuario: usuarioId,
      activa: true,
    });

    if (!suscripcion) {
      return res.status(404).json({
        success: false,
        message: "El usuario no tiene una suscripción activa.",
      });
    }

    if (suscripcion.serviciosUsados >= suscripcion.serviciosTotales) {
      return res.json({
        success: true,
        msg: "El usuario ya usó todos sus servicios de la suscripción.",
        cobrar: true,
        serviciosUsados: suscripcion.serviciosUsados,
        serviciosTotales: suscripcion.serviciosTotales,
      });
    }

    suscripcion.serviciosUsados += 1;
    await suscripcion.save();

    return res.json({
      success: true,
      msg: "Servicio registrado.",
      cobrar: false,
      serviciosUsados: suscripcion.serviciosUsados,
      serviciosRestantes:
        suscripcion.serviciosTotales - suscripcion.serviciosUsados,
    });
  } catch (error) {
    console.error("Error al registrar uso:", error);
    return res.status(500).json({ success: false, message: "Error interno." });
  }
};
