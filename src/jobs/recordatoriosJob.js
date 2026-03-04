import cron from "node-cron";
import Reserva from "../models/reserva.model.js";
import Usuario from "../models/usuario.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { sendReminderEmail } from "../../src/controllers/mailController.js";

dayjs.extend(utc);
dayjs.extend(timezone);

class RecordatoriosJob {
  init() {
    // ✅ Corre cada 15 minutos — suficiente precisión sin sobrecargar
    cron.schedule("*/15 * * * *", async () => {
      await this.enviarRecordatorios24h();
      await this.enviarRecordatorios3h();
    });

    console.log("✅ Job de recordatorios iniciado");
  }

  /* =============================
     RECORDATORIO 24 HORAS ANTES
  ============================== */
  async enviarRecordatorios24h() {
    try {
      const ahora = dayjs().tz("America/Santiago");

      // Buscar reservas que ocurran entre 23h y 25h desde ahora
      const desde = ahora.add(23, "hour").toDate();
      const hasta = ahora.add(25, "hour").toDate();

      const reservas = await Reserva.find({
        fecha: { $gte: desde, $lte: hasta },
        estado: { $in: ["pendiente", "confirmada"] },
        recordatorioEnviado: { $ne: true }, // ✅ cambia esto
      })
        .populate("servicio", "nombre")
        .populate("barbero", "nombre apellido");

      for (const reserva of reservas) {
        try {
          const cliente = await Usuario.findById(reserva.cliente).select(
            "nombre email",
          );
          if (!cliente?.email) continue;

          const fechaChile = dayjs(reserva.fecha).tz("America/Santiago");

          await sendReminderEmail(cliente.email, {
            nombreCliente: cliente.nombre,
            nombreBarbero:
              `${reserva.barbero?.nombre} ${reserva.barbero?.apellido || ""}`.trim(),
            servicio: reserva.servicio?.nombre || "Servicio",
            fecha: fechaChile.format("DD/MM/YYYY"),
            hora: fechaChile.format("HH:mm"),
            tipo: "24h",
          });

          await Reserva.findByIdAndUpdate(reserva._id, {
            recordatorioEnviado: true,
            fechaRecordatorio: new Date(),
          });

          // Pequeña pausa para no saturar el servicio de email
          await new Promise((r) => setTimeout(r, 500));
        } catch (error) {
          console.error(
            `❌ Error recordatorio 24h reserva ${reserva._id}:`,
            error.message,
          );
        }
      }
    } catch (error) {
      console.error("❌ Error en enviarRecordatorios24h:", error);
    }
  }

  /* =============================
     RECORDATORIO 3 HORAS ANTES
  ============================== */
  async enviarRecordatorios3h() {
    try {
      const ahora = dayjs().tz("America/Santiago");

      // Buscar reservas que ocurran entre 2h45 y 3h15 desde ahora
      const desde = ahora.add(2, "hour").add(45, "minute").toDate();
      const hasta = ahora.add(3, "hour").add(15, "minute").toDate();

      const reservas = await Reserva.find({
        fecha: { $gte: desde, $lte: hasta },
        estado: { $in: ["pendiente", "confirmada"] },
        recordatorio3hEnviado: { $ne: true }, // ✅ cambia esto
      })
        .populate("servicio", "nombre")
        .populate("barbero", "nombre apellido");

      for (const reserva of reservas) {
        try {
          const cliente = await Usuario.findById(reserva.cliente).select(
            "nombre email",
          );
          if (!cliente?.email) continue;

          const fechaChile = dayjs(reserva.fecha).tz("America/Santiago");

          await sendReminderEmail(cliente.email, {
            nombreCliente: cliente.nombre,
            nombreBarbero:
              `${reserva.barbero?.nombre} ${reserva.barbero?.apellido || ""}`.trim(),
            servicio: reserva.servicio?.nombre || "Servicio",
            fecha: fechaChile.format("DD/MM/YYYY"),
            hora: fechaChile.format("HH:mm"),
            tipo: "3h",
          });

          await Reserva.findByIdAndUpdate(reserva._id, {
            recordatorio3hEnviado: true,
          });

          await new Promise((r) => setTimeout(r, 500));
        } catch (error) {
          console.error(
            `❌ Error recordatorio 3h reserva ${reserva._id}:`,
            error.message,
          );
        }
      }
    } catch (error) {
      console.error("❌ Error en enviarRecordatorios3h:", error);
    }
  }
}

export default new RecordatoriosJob();
