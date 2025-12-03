import NotificacionHora from "../models/notificacion.Model.js";

export const crearNotificacion = async (req, res) => {
  try {
    const { fecha, horas, barberoId, usuarioId} = req.body
    console.log(fecha, horas, barberoId, usuarioId);

    horas.forEach(async (hora) => {
      const fechaHora = new Date(`${fecha}T${hora}:00`); // Combina fecha + hora
      await NotificacionHora.create({
        usuarioId,
        barberoId,
        fecha: fechaHora, // aquí ya tienes fecha+hora exacta
        enviado: false,
      });
    });

    const nueva = await NotificacionHora({
      usuarioId,
      barberoId,
      fecha,
      enviado: false,
    });
    await nueva.save();
    res.status(201).json({ message: "Notificación creada" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
