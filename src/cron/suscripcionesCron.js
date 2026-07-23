import suscripcionModel from "../models/suscripcion.model.js";
import usuarioModel from "../models/usuario.model.js";
import reservaModel from "../models/reserva.model.js";
import cron from "node-cron";

const SERVICIO_COMBO_ID = "69934ce087e49726a2cd3da1";
const SERVICIO_BARBA_ID = "6993a5495dada31f33304c19";

export const iniciarCronSuscripciones = () => {
  cron.schedule("10 0 * * *", async () => {
    try {
      const ahora = new Date();

      // 1️⃣ Actualizar serviciosUsados según reservas ya cumplidas
      const suscripcionesActivas = await suscripcionModel.find({
        activa: true,
      });

      for (const sub of suscripcionesActivas) {
        const reservasPasadas = await reservaModel
          .find({
            cliente: sub.usuario,
            fecha: { $gte: sub.fechaInicio, $lte: ahora },
            estado: { $ne: "cancelada" },
          })
          .populate("servicio", "_id");

        let usados = 0;
        for (const r of reservasPasadas) {
          const sid = r.servicio?._id?.toString();
          if (sub.tipoPlan === "combo_visita_corte_barba") {
            if (sid === SERVICIO_COMBO_ID) usados += 1;
          } else if (sub.tipoPlan === "barba") {
            if (sid === SERVICIO_BARBA_ID) usados += 1;
          } else {
            // creditos y padre_e_hijo
            usados += r.duracion >= 120 ? 2 : 1;
          }
        }

        await suscripcionModel.findByIdAndUpdate(sub._id, {
          $set: { serviciosUsados: usados },
        });
      }

      // 2️⃣ Vencidas por fecha
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

      // 3️⃣ Agotadas por servicios
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

      console.log("✅ Cron suscripciones ejecutado correctamente");
    } catch (error) {
      console.error("❌ Error procesando vencimientos:", error);
    }
  });
};
