import NotificacionHora from "../models/notificacion.Model.js";

export const crearNotificacion = async (req, res) => {
  try {
    const { fecha, hora, horas, barberoId, usuarioId, emailInvitado, esInvitado } = req.body;

    const horasFinales = horas || (hora ? [hora] : []);

    // Validación según tipo de usuario
    if (!fecha || !barberoId || horasFinales.length === 0) {
      return res.status(400).json({ message: "Faltan datos para crear la notificación" });
    }

    if (esInvitado) {
      if (!emailInvitado) {
        return res.status(400).json({ message: "El correo es requerido para invitados" });
      }
    } else {
      if (!usuarioId) {
        return res.status(400).json({ message: "El usuarioId es requerido" });
      }
    }

    const notificaciones = [];

    for (const h of horasFinales) {
      const fechaHora = new Date(`${fecha}T${h}:00-03:00`);

      const nueva = await NotificacionHora.create({
        usuarioId: esInvitado ? null : usuarioId,
        barberoId,
        fecha: fechaHora,
        enviado: false,
        emailInvitado: esInvitado ? emailInvitado : null,
        esInvitado: !!esInvitado,
      });

      notificaciones.push(nueva);
    }

    res.status(201).json({ message: "Notificación creada", total: notificaciones.length });
  } catch (error) {
    console.error("❌ Error crearNotificacion:", error);
    res.status(500).json({ message: error.message });
  }
};