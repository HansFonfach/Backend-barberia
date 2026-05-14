import cron from "node-cron";
import Reserva from "../models/reserva.model.js";
import usuarioModel from "../models/usuario.model.js";
import suscripcionModel from "../models/suscripcion.model.js";

// Servicios que aplican para cada tipo de plan
const SERVICIOS_POR_PLAN = {
  creditos: ["69934c9b87e49726a2cd3d9d"],
  combo_corte_barba: ["69934ce087e49726a2cd3da1"],
  combo_visita_corte_barba: ["69934ce087e49726a2cd3da1"],
};

// Planes que descuentan por servicio (no solo por fecha)
const PLANES_POR_SERVICIO = Object.keys(SERVICIOS_POR_PLAN);

export const iniciarJobReservas = () => {
  cron.schedule("0 */2 * * *", async () => {
    try {
      const ahora = new Date();

      const reservas = await Reserva.find({
        estado: "pendiente",
        $expr: {
          $lte: [
            { $add: ["$fecha", { $multiply: ["$duracion", 60000] }] },
            ahora,
          ],
        },
      });

      if (!reservas.length) return;

      for (const reserva of reservas) {
        // 1️⃣ Marcar como completada
        reserva.estado = "completada";

        // 2️⃣ Puntos
        if (!reserva.puntosSumados) {
          await usuarioModel.updateOne(
            { _id: reserva.cliente },
            { $inc: { puntos: reserva.puntosOtorgados } },
          );
          reserva.puntosSumados = true;
        }

        await reserva.save();

        // 3️⃣ Verificar suscripción activa del cliente
        const suscripcion = await suscripcionModel.findOne({
          usuario: reserva.cliente,
          empresa: reserva.empresa,
          activa: true,
          fechaFin: { $gte: ahora },
        });

        if (!suscripcion) continue;

        // 4️⃣ ¿Es un plan que descuenta por servicio?
        if (!PLANES_POR_SERVICIO.includes(suscripcion.tipoPlan)) continue;

        // 5️⃣ ¿El servicio reservado aplica para este plan?
        const serviciosElegibles = SERVICIOS_POR_PLAN[suscripcion.tipoPlan];
        const servicioAplica = serviciosElegibles.includes(
          reserva.servicio.toString(),
        );

        if (!servicioAplica) continue;

        // 6️⃣ Descontar crédito
        const nuevosUsados = suscripcion.serviciosUsados + 1;
        const agotada = nuevosUsados >= suscripcion.serviciosTotales;

        await suscripcionModel.findByIdAndUpdate(suscripcion._id, {
          $inc: { serviciosUsados: 1 },
          ...(agotada && { $set: { activa: false } }),
        });

        // 7️⃣ Si se agotó, actualizar usuario
        if (agotada) {
          await usuarioModel.findByIdAndUpdate(reserva.cliente, {
            $set: { suscrito: false },
          });
        }
      }
    } catch (error) {
      console.error("❌ Error en job de reservas:", error);
    }
  });
};
