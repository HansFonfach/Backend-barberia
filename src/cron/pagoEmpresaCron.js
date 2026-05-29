// crons/pagoEmpresaCron.js
import cron from "node-cron";
import dayjs from "dayjs";
import PagoEmpresa from "../models/pagoEmpresa.model.js";
import empresaModel from "../models/empresa.model.js";
import { sendRecordatorioPagoEmail } from "../controllers/mailController.js";

export const iniciarCronpagoEmpresa = () => {
  cron.schedule("* * * * *", async () => {
    const hoy = dayjs().startOf("day");

    const pagos = await PagoEmpresa.find({
      estado: { $in: ["pendiente", "atrasado"] },
    }).populate("empresa");

    for (const pago of pagos) {
      const empresa = pago.empresa;
      if (!empresa || empresa.estadoSuscripcion === "cancelado") continue;

      const vencimiento = dayjs(pago.fechaVencimiento).startOf("day");
      const diasDiff = vencimiento.diff(hoy, "day");
      let modificado = false;

      // 5 días antes
      if (diasDiff === 5 && !pago.notificaciones.diasAntes5) {
        try {
          await sendRecordatorioPagoEmail(empresa, { tipo: "5_dias_antes" });
          pago.notificaciones.diasAntes5 = true;
          modificado = true;
        } catch (err) {
          console.error("❌ Error email 5 días:", err.message);
        }
      }

      // 2 días antes
      if (diasDiff === 2 && !pago.notificaciones.diasAntes2) {
        try {
          await sendRecordatorioPagoEmail(empresa, { tipo: "2_dias_antes" });
          pago.notificaciones.diasAntes2 = true;
          modificado = true;
        } catch (err) {
          console.error("❌ Error email 2 días:", err.message);
        }
      }

      // 1 día antes (nuevo — recupera casos perdidos)
      if (diasDiff === 1 && !pago.notificaciones.diasAntes1) {
        try {
          await sendRecordatorioPagoEmail(empresa, { tipo: "1_dia_antes" });
          pago.notificaciones.diasAntes1 = true;
          modificado = true;
        } catch (err) {
          console.error("❌ Error email 1 día:", err.message);
        }
      }

      // Día de vencimiento
      if (diasDiff === 0 && !pago.notificaciones.diaVencimiento) {
        try {
          await sendRecordatorioPagoEmail(empresa, { tipo: "vencimiento_hoy" });
          pago.notificaciones.diaVencimiento = true;
          pago.estado = "atrasado";
          modificado = true;
        } catch (err) {
          console.error("❌ Error email vencimiento:", err.message);
        }
      }

      // 3 días después
      if (diasDiff === -3 && !pago.notificaciones.diasDespues3) {
        try {
          await sendRecordatorioPagoEmail(empresa, { tipo: "suspension" });
          pago.notificaciones.diasDespues3 = true;
          pago.estado = "atrasado";
          modificado = true;
          await empresaModel.findByIdAndUpdate(empresa._id, {
            estadoSuscripcion: "suspendido",
            suspendidaDesde: new Date(),
            motivoSuspension: "Pago no recibido",
          });
        } catch (err) {
          console.error("❌ Error email suspensión:", err.message);
        }
      }

      if (modificado) {
        pago.markModified("notificaciones");
        await pago.save();
      }
    }
  });
};