import cron from "node-cron";
import Reserva from "../models/reserva.model.js";
import usuarioModel from "../models/usuario.model.js";

export const iniciarJobReservas = () => {
  // Cada 5 minutos
  cron.schedule("*/5 * * * *", async () => {
    try {
      const ahora = new Date();

      const reservas = await Reserva.find({
        estado: "pendiente",
        fecha: { $lte: ahora },
      });

      if (!reservas.length) {
        return;
      }

      for (const reserva of reservas) {
        // Marcar como completada
        reserva.estado = "completada";

        // Sumar puntos solo una vez
        if (!reserva.puntosSumados) {
          await usuarioModel.updateOne(
            { _id: reserva.cliente },
            { $inc: { puntos: reserva.puntosOtorgados } },
          );

          reserva.puntosSumados = true;
        }

        await reserva.save();
      }
    } catch (error) {
      console.error("❌ Error en job de reservas:", error);
    }
  });
};
