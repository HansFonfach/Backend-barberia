// cron/recordatorioPagoCron.js
import cron from "node-cron";
import dayjs from "dayjs";

import empresaModel from "../models/empresa.model.js";
import whatsappService from "../services/whatsappService.js";

export const recordatorioPagoCron = {
  iniciar() {
    // Se ejecuta todos los días a las 9:00 AM
    cron.schedule("0 9 * * *", async () => {
      console.log("🔔 Ejecutando cron recordatorio de pago...");
      await this.enviarRecordatoriosPago();
    });
  },

  async enviarRecordatoriosPago() {
    try {
      const hoy = dayjs().startOf("day");

      // Buscar empresas cuyo proximoPago sea hoy
      const empresas = await empresaModel.find({
        estadoSuscripcion: "activo",
        proximoPago: {
          $gte: hoy.toDate(),
          $lt: hoy.endOf("day").toDate(),
        },
        telefono: { $exists: true, $ne: null },
      });

      console.log(`📋 Empresas con vencimiento hoy: ${empresas.length}`);

      for (const empresa of empresas) {
        const resultado = await whatsappService.enviarRecordatorioPago({
          telefono: empresa.telefono,
          nombreEmpresa: empresa.nombre,
        });

        if (resultado.success) {
          console.log(`✅ Recordatorio enviado a: ${empresa.nombre}`);
        } else {
          console.error(
            `❌ Error enviando a ${empresa.nombre}:`,
            resultado.error,
          );
        }
      }
    } catch (error) {
      console.error("❌ Error en cron recordatorio pago:", error.message);
    }
  },

  // Para probar manualmente
  async testEnviar(empresaId) {
    const empresa = await empresaModel.findById(empresaId);
    if (!empresa) return { error: "Empresa no encontrada" };

    return await whatsappService.enviarRecordatorioPago({
      telefono: "75297584",
      nombreEmpresa: empresa.nombre,
    });
  },
};

export default recordatorioPagoCron; // 👈 agrega esta línea
