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
    const SERVICIO_CORTE_BARBA_ID = "69934ce087e49726a2cd3da1";
    const { id } = req.params;
    const { tipoPlan } = req.body;

    // 1️⃣ Validar plan
    const planesPermitidos = ["creditos", "combo_visita_corte_barba"];
    if (!planesPermitidos.includes(tipoPlan)) {
      return res.status(400).json({
        success: false,
        message: "Tipo de plan inválido",
      });
    }

    // 2️⃣ Usuario
    const usuario = await Usuario.findById(id);

    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
    }

    // 3️⃣ Validar suscripción activa
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

    // 4️⃣ Configuración del plan
    let serviciosTotales = 2;
    let precio = 25000;

    switch (tipoPlan) {
      case "creditos":
        serviciosTotales = 2;
        precio = 25000;
        break;

      case "combo_visita_corte_barba":
        serviciosTotales = 2;
        precio = 45000;
        break;
    }

    // 5️⃣ Fechas
    const fechaInicio = new Date();

    const fechaFin = new Date();
    fechaFin.setDate(fechaFin.getDate() + 30);

    // 6️⃣ Crear suscripción
    const nueva = await Suscripcion.create({
      usuario: usuario._id,
      empresa: usuario.empresa,

      activa: true,

      fechaInicio,
      fechaFin,

      historial: false,

      tipoPlan,

      serviciosTotales,
      serviciosUsados: 0,
    });

    // 7️⃣ Actualizar usuario
    await Usuario.findByIdAndUpdate(usuario._id, {
      $inc: { puntos: 50 },
      $set: { suscrito: true },
    });

    // 8️⃣ Mail
    sendSuscriptionActiveEmail(usuario.email, {
      nombreCliente: usuario.nombre,
      fechaInicio: fechaInicio.toLocaleDateString("es-CL"),
      fechaFin: fechaFin.toLocaleDateString("es-CL"),
    }).catch(console.error);

    return res.status(201).json({
      success: true,
      message: "Suscripción creada correctamente",
      data: nueva,
    });
  } catch (error) {
    console.error(error);

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
    const SERVICIO_COMBO_ID = "69934ce087e49726a2cd3da1";

    let suscripcion = await Suscripcion.findOne({
      usuario: userId,
      activa: true,
    });

    if (!suscripcion) {
      return res.json({ activa: false, msg: "Usuario sin suscripción" });
    }

    // 🔥 Venció por tiempo
    if (suscripcion.fechaFin < new Date()) {
      suscripcion.activa = false;
      suscripcion.historial = true;
      await suscripcion.save();
      await Usuario.findByIdAndUpdate(userId, { suscrito: false });
      return res.json({ activa: false, msg: "Suscripción vencida" });
    }

    // 🔥 Calcular servicios usados en tiempo real
    const esCombo = suscripcion.tipoPlan === "combo_visita_corte_barba";

    const reservas = await reservaModel
      .find({
        cliente: userId,
        fecha: {
          $gte: suscripcion.fechaInicio,
          // Solo reservas que ya pasaron (asistencia confirmada implícita)
          $lte: new Date(),
        },
        estado: { $ne: "cancelada" },
      })
      .populate("servicio", "_id");

    let serviciosUsados = 0;
    for (const r of reservas) {
      if (esCombo) {
        if (r.servicio?._id?.toString() === SERVICIO_COMBO_ID) {
          serviciosUsados += 1;
        }
      } else {
        serviciosUsados += r.duracion >= 120 ? 2 : 1;
      }
    }

    // 🔥 Venció por servicios agotados (solo reservas pasadas)
    if (serviciosUsados >= suscripcion.serviciosTotales) {
      suscripcion.activa = false;
      suscripcion.historial = true;
      await suscripcion.save();
      await Usuario.findByIdAndUpdate(userId, { suscrito: false });
      return res.json({ activa: false, msg: "Suscripción agotada" });
    }

    const restantes = suscripcion.serviciosTotales - serviciosUsados;

    return res.json({
      activa: true,
      tipoPlan: suscripcion.tipoPlan,
      serviciosTotales: suscripcion.serviciosTotales,
      serviciosUsados,
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

    const SERVICIO_COMBO_ID = "69934ce087e49726a2cd3da1";
    const esCombo = sus.tipoPlan === "combo_visita_corte_barba";

    const reservas = await reservaModel
      .find({
        cliente: userId,
        fecha: { $gte: sus.fechaInicio, $lte: sus.fechaFin },
        estado: { $ne: "cancelada" },
      })
      .populate("servicio", "_id");

    let serviciosUsados = 0;
    for (const r of reservas) {
      if (esCombo) {
        // Solo cuenta el servicio combo
        if (r.servicio?._id?.toString() === SERVICIO_COMBO_ID) {
          serviciosUsados += 1;
        }
      } else {
        serviciosUsados += r.duracion >= 120 ? 2 : 1;
      }
    }

    return res.json({
      tipoPlan: sus.tipoPlan,
      fechaInicio: sus.fechaInicio,
      fechaFin: sus.fechaFin,
      serviciosTotales: sus.serviciosTotales,
      serviciosUsados,
    });
  } catch (e) {
    res.status(500).json({ message: "Error obteniendo suscripción activa" });
  }
};
