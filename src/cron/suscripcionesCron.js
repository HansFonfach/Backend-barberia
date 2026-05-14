import suscripcionModel from "../models/suscripcion.model.js";
import usuarioModel from "../models/usuario.model.js";
import cron from "node-cron";

export const iniciarCronSuscripciones = () => {
  cron.schedule("10 0 * * *", async () => {
    try {
      const ahora = new Date();

      // 1️⃣ Vencidas por fecha
      const suscripcionesVencidas = await suscripcionModel.find({
        activa: true,
        fechaFin: { $lt: ahora },
      });

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

      // 2️⃣ Agotadas por servicios (red de seguridad)
      const suscripcionesAgotadas = await suscripcionModel.find({
        activa: true,
        $expr: { $gte: ["$serviciosUsados", "$serviciosTotales"] },
      });

      for (const sub of suscripcionesAgotadas) {
        sub.activa = false;
        await sub.save();

        const usuario = await usuarioModel.findById(sub.usuario);
        if (usuario) {
          usuario.suscrito = false;
          await usuario.save();
        }
      }
    } catch (error) {
      console.error("❌ Error procesando vencimientos:", error);
    }
  });
};
