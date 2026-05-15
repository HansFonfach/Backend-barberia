// crons/pagoEmpresaCron.js
import cron from "node-cron";
import dayjs from "dayjs";
import PagoEmpresa from "../models/pagoEmpresa.model.js";
import empresaModel from "../models/empresa.model.js";
import { sendRecordatorioPagoEmail } from "../controllers/mailController.js";

export const iniciarCronpagoEmpresa = () => {
  cron.schedule("0 9 * * *", async () => {
    console.log("🔄 Revisando pagos de empresas...");

    const hoy = dayjs().startOf("day");

    const pagos = await PagoEmpresa.find({
      estado: { $in: ["pendiente", "atrasado"] },
    }).populate("empresa");

    for (const pago of pagos) {
      const empresa = pago.empresa;

      if (!empresa || empresa.estadoSuscripcion === "cancelado") continue;

      const vencimiento = dayjs(pago.fechaVencimiento).startOf("day");
      const diasDiff = vencimiento.diff(hoy, "day");

      if (diasDiff === 5 && !pago.notificaciones.diasAntes5) {
        try {
          const resultado = await sendRecordatorioPagoEmail(empresa, {
            tipo: "5_dias_antes",
          });
        } catch (err) {
          console.error("❌ Error enviando email:", err.message);
        }
        pago.notificaciones.diasAntes5 = true;
      }

      if (diasDiff === 2 && !pago.notificaciones.diasAntes2) {
        try {
          const resultado = await sendRecordatorioPagoEmail(empresa, {
            tipo: "2_dias_antes",
          });
        } catch (err) {}
        pago.notificaciones.diasAntes2 = true;
      }

      if (diasDiff === 0 && !pago.notificaciones.diaVencimiento) {
        try {
          const resultado = await sendRecordatorioPagoEmail(empresa, {
            tipo: "vencimiento_hoy",
          });
        } catch (err) {}
        pago.notificaciones.diaVencimiento = true;
        pago.estado = "atrasado";
      }

      if (diasDiff === -3 && !pago.notificaciones.diasDespues3) {
        try {
          const resultado = await sendRecordatorioPagoEmail(empresa, {
            tipo: "suspension",
          });
        } catch (err) {}
        pago.notificaciones.diasDespues3 = true;
        pago.estado = "atrasado";

        await empresaModel.findByIdAndUpdate(empresa._id, {
          estadoSuscripcion: "suspendido",
          suspendidaDesde: new Date(),
          motivoSuspension: "Pago no recibido",
        });
      }

      await pago.save();
    }
  });
};
