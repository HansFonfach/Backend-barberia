import suscripcionModel from "../models/suscripcion.model.js";
import usuarioModel from "../models/usuario.model.js";
import cron from "node-cron";

export const iniciarCronSuscripciones = () => {
  // Corre cada minuto
  cron.schedule("10 0 * * *", async () => {
    try {
      const ahora = new Date();

      // Buscar suscripciones activas cuyo fin ya pasó
      const suscripcionesVencidas = await suscripcionModel.find({
        activa: true,
        fechaFin: { $lt: ahora },
      });

      if (suscripcionesVencidas.length === 0) {
        return;
      }

      for (const sub of suscripcionesVencidas) {
        sub.activa = false;
        await sub.save();

        const usuario = await usuarioModel.findById(sub.usuario);
        if (usuario) {
          usuario.suscrito = false;
          usuario.plan = "gratis";
          await usuario.save();
        }
      }
    } catch (error) {
      console.error("❌ Error procesando vencimientos:", error);
    }
  });
};
