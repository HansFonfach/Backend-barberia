import reservaModel from "../models/reserva.model.js";
import Suscripcion from "../models/suscripcion.model.js";
import Usuario from "../models/usuario.model.js";
import { checkSuscripcion } from "../utils/checkSuscripcion.js";
import { sendSuscriptionActiveEmail } from "./mailController.js";

/* =======================================================
   🟢 Crear Suscripción
======================================================= */
export const crearSuscripcion = async (req, res) => {
  try {
    const { id } = req.params; // usuarioId

    // 1️⃣ Usuario
    const usuario = await Usuario.findById(id);
    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
    }

    if (!usuario.empresa) {
      return res.status(400).json({
        success: false,
        message: "El usuario no tiene empresa asociada",
      });
    }

    // 2️⃣ Suscripción activa del usuario en esta empresa
    const suscripcionActiva = await Suscripcion.findOne({
      usuario: usuario._id,
      empresa: usuario.empresa,
      activa: true,
    });

    if (suscripcionActiva) {
      return res.status(409).json({
        success: false,
        message: "El usuario ya tiene una suscripción activa",
      });
    }

    // 3️⃣ 🔥 LÍMITE POR EMPRESA (AQUÍ VA)
    const limiteEmpresa = 20;

    const totalActivasEmpresa = await Suscripcion.countDocuments({
      empresa: usuario.empresa,
      activa: true,
    });

    if (totalActivasEmpresa >= limiteEmpresa) {
      return res.status(400).json({
        success: false,
        message:
          "Esta barbería alcanzó el límite máximo de suscripciones activas",
      });
    }

    // 4️⃣ Fechas
    const fechaInicio = new Date();
    const fechaFin = new Date(fechaInicio);
    fechaFin.setDate(fechaFin.getDate() + 30);

    // 5️⃣ Crear
    const nueva = await Suscripcion.create({
      usuario: usuario._id,
      empresa: usuario.empresa,
      activa: true,
      fechaInicio,
      fechaFin,
      historial: false,
      serviciosTotales: 2,
      serviciosUsados: 0,
    });

    // 6️⃣ Marcar usuario + sumar 50 puntos
    const actualizado = await Usuario.findByIdAndUpdate(
      usuario._id,
      {
        $inc: { puntos: 50 },
        $set: { suscrito: true },
      },
      {
        new: true,
        runValidators: true,
      },
    );

    sendSuscriptionActiveEmail(usuario.email, {
      nombreCliente: usuario.nombre,
      fechaInicio: fechaInicio.toLocaleDateString("es-CL"),
      fechaFin: fechaFin.toLocaleDateString("es-CL"),
    }).catch((err) => {
      console.error("Error enviando correo de suscripción:", err);
    });

    return res.status(201).json({
      success: true,
      message: "Suscripción creada correctamente",
      data: nueva,
    });
  } catch (error) {
    console.error("Error al crear suscripción:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};
/* =======================================================
   🔴 Cancelar Suscripción
======================================================= */
export const cancelarSuscripcion = async (req, res) => {
  try {
    const { id } = req.params;

    const suscripcion = await Suscripcion.findOne({
      usuario: id,
      activa: true,
    });

    if (!suscripcion) {
      return res.status(404).json({
        success: false,
        message: "No se encontró una suscripción activa.",
      });
    }

    suscripcion.activa = false;
    suscripcion.historial = true;
    suscripcion.fechaFin = new Date();
    await suscripcion.save();

    await Usuario.findByIdAndUpdate(id, { suscrito: false });

    return res.status(200).json({
      success: true,
      message: "Suscripción cancelada correctamente.",
    });
  } catch (error) {
    console.error("Error al cancelar suscripción:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno al cancelar la suscripción.",
    });
  }
};

/* =======================================================
   🟡 Estado suscripción para el cliente
======================================================= */
export const estadoSuscripcionCliente = async (req, res) => {
  try {
    const { userId } = req.params;

    let suscripcion = await Suscripcion.findOne({
      usuario: userId,
      activa: true,
    });

    // 🔥 VERIFICAR SI YA VENCIO
    if (suscripcion && suscripcion.fechaFin < new Date()) {
      suscripcion.activa = false;
      suscripcion.historial = true;
      await suscripcion.save();

      await Usuario.findByIdAndUpdate(userId, { suscrito: false });

      return res.json({ activa: false, msg: "Suscripción vencida" });
    }

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
    console.error(error);
    return res.status(500).json({ msg: "Error interno" });
  }
};

/* =======================================================
   🟣 Registrar uso de servicio (barbero usa esto)
======================================================= */
export const registrarUsoServicio = async (req, res) => {
  try {
    const { usuarioId } = req.body;

    let suscripcion = await Suscripcion.findOne({
      usuario: usuarioId,
      activa: true,
    });

    if (!suscripcion) {
      return res.status(404).json({
        success: false,
        message: "El usuario no tiene una suscripción activa.",
      });
    }

    // 🔥 Si ya venció → pasar a historial y desactivar
    if (suscripcion.fechaFin < new Date()) {
      suscripcion.activa = false;
      suscripcion.historial = true;
      await suscripcion.save();

      await Usuario.findByIdAndUpdate(usuarioId, { suscrito: false });

      return res.json({
        success: false,
        message: "La suscripción ya venció.",
        cobrar: true,
      });
    }

    // 🔥 Si ya usó todo → no permitir más
    if (suscripcion.serviciosUsados >= suscripcion.serviciosTotales) {
      return res.json({
        success: true,
        msg: "El usuario ya usó todos sus servicios.",
        cobrar: true,
      });
    }

    // Registrar uso
    suscripcion.serviciosUsados += 1;

    // 🔥 Si ahora llegó al límite → cerrar suscripción
    if (suscripcion.serviciosUsados >= suscripcion.serviciosTotales) {
      suscripcion.activa = false;
      suscripcion.historial = true;

      await Usuario.findByIdAndUpdate(usuarioId, { suscrito: false });
    }

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

/* =======================================================
   🟢 Obtener suscripción activa (para dashboard del cliente)
======================================================= */
export const getSuscripcionActiva = async (req, res) => {
  try {
    const userId = req.usuario.id;
    const sus = await checkSuscripcion(userId);
    if (!sus) return res.json(null);

    // Contar reservas no canceladas dentro del período de suscripción
    const reservas = await reservaModel.find({
      cliente: userId,
      fecha: { $gte: sus.fechaInicio, $lte: sus.fechaFin },
      estado: { $ne: "cancelada" },
    });

    // Mismo criterio que en getReservasPorFechaBarbero
    let serviciosUsados = 0;
    for (const r of reservas) {
      serviciosUsados += r.duracion >= 120 ? 2 : 1;
    }

    return res.json({
      fechaInicio: sus.fechaInicio,
      fechaFin: sus.fechaFin,
      serviciosTotales: sus.serviciosTotales,
      serviciosUsados, // ✅ calculado en tiempo real
    });
  } catch (e) {
    res.status(500).json({ message: "Error obteniendo suscripción activa" });
  }
};