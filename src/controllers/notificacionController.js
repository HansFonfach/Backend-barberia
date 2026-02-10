import NotificacionHora from "../models/notificacion.Model.js";

export const crearNotificacion = async (req, res) => {
  try {
    const { fecha, hora, horas, barberoId, usuarioId } = req.body;

    // Normalizamos a array
    const horasFinales = horas || (hora ? [hora] : []);

    if (!fecha || !barberoId || !usuarioId || horasFinales.length === 0) {
      return res.status(400).json({
        message: "Faltan datos para crear la notificación",
      });
    }

    const notificaciones = [];

    for (const h of horasFinales) {
      const fechaHora = new Date(`${fecha}T${h}:00`);

      const nueva = await NotificacionHora.create({
        usuarioId,
        barberoId,
        fecha: fechaHora,
        enviado: false,
      });

      notificaciones.push(nueva);
    }

    res.status(201).json({
      message: "Notificación creada",
      total: notificaciones.length,
    });
  } catch (error) {
    console.error("❌ Error crearNotificacion:", error);
    res.status(500).json({ message: error.message });
  }
};
