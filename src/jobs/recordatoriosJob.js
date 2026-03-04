import cron from "node-cron";
import Reserva from "../models/reserva.model.js";
import Usuario from "../models/usuario.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { sendReminderEmail } from "../controllers/mailController.js";
import WhatsAppService from "../services/whatsappService.js";

dayjs.extend(utc);
dayjs.extend(timezone);

class RecordatoriosJob {
  init() {
    // ✅ Corre cada 15 minutos
    cron.schedule("*/15 * * * *", async () => {
      console.log(
        "🔔 Verificando recordatorios...",
        dayjs().tz("America/Santiago").format("HH:mm"),
      );
      await this.enviarRecordatorios24h();
      await this.enviarRecordatorios3h();
    });

    console.log("✅ Job de recordatorios iniciado");
  }

  /* =============================
     UTIL: datos comunes
  ============================== */
  async obtenerDatosReserva(reserva) {
    const cliente = await Usuario.findById(reserva.cliente).select(
      "nombre email telefono",
    );
    if (!cliente) return null;

    const fechaChile = dayjs(reserva.fecha).tz("America/Santiago");

    return {
      cliente,
      datos: {
        nombreCliente: cliente.nombre,
        nombreBarbero:
          `${reserva.barbero?.nombre} ${reserva.barbero?.apellido || ""}`.trim(),
        servicio: reserva.servicio?.nombre || "Servicio",
        fecha: fechaChile.format("DD/MM/YYYY"),
        hora: fechaChile.format("HH:mm"),
      },
    };
  }

  /* =============================
     ENVIAR POR EMAIL + WHATSAPP
  ============================== */
  async enviarPorTodosLosCanales(cliente, datos, tipo) {
    // ✅ Email
    if (cliente.email) {
      console.log("📧 Intentando enviar email a:", cliente.email);
      try {
        const resEmail = await sendReminderEmail(cliente.email, {
          ...datos,
          tipo,
        });
        console.log("📧 Respuesta Resend:", resEmail);
      } catch (err) {
        console.error(`❌ Error email ${cliente.email}:`, err.message);
      }
    }

    // ✅ WhatsApp
    if (cliente.telefono) {
      await WhatsAppService.enviarRecordatorio({
        ...datos,
        telefono: cliente.telefono,
      }).catch((err) =>
        console.error(`❌ Error WhatsApp ${cliente.telefono}:`, err.message),
      );
    }
  }

  /* =============================
     RECORDATORIO 24 HORAS ANTES
  ============================== */
  async enviarRecordatorios24h() {
    try {
      const ahora = dayjs().tz("America/Santiago");
      const desde = ahora.add(23, "hour").toDate();
      const hasta = ahora.add(25, "hour").toDate();

      const reservas = await Reserva.find({
        fecha: { $gte: desde, $lte: hasta },
        estado: { $in: ["pendiente", "confirmada"] },
        recordatorioEnviado: { $ne: true },
      })
        .populate("servicio", "nombre")
        .populate("barbero", "nombre apellido");

      console.log(
        `📋 Recordatorios 24h: ${reservas.length} reservas encontradas`,
      );

      for (const reserva of reservas) {
        try {
          const resultado = await this.obtenerDatosReserva(reserva);
          if (!resultado) continue;

          const { cliente, datos } = resultado;

          await this.enviarPorTodosLosCanales(cliente, datos, "24h");

          await Reserva.findByIdAndUpdate(reserva._id, {
            recordatorioEnviado: true,
            fechaRecordatorio: new Date(),
          });

          console.log(`✅ Recordatorio 24h enviado — ${cliente.nombre}`);
          await new Promise((r) => setTimeout(r, 500));
        } catch (error) {
          console.error(
            `❌ Error procesando reserva ${reserva._id}:`,
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
      const desde = ahora.add(2, "hour").add(45, "minute").toDate();
      const hasta = ahora.add(3, "hour").add(15, "minute").toDate();

      const reservas = await Reserva.find({
        fecha: { $gte: desde, $lte: hasta },
        estado: { $in: ["pendiente", "confirmada"] },
        recordatorio3hEnviado: { $ne: true },
      })
        .populate("servicio", "nombre")
        .populate("barbero", "nombre apellido");

      console.log(
        `📋 Recordatorios 3h: ${reservas.length} reservas encontradas`,
      );

      for (const reserva of reservas) {
        try {
          const resultado = await this.obtenerDatosReserva(reserva);
          if (!resultado) continue;

          const { cliente, datos } = resultado;

          await this.enviarPorTodosLosCanales(cliente, datos, "3h");

          await Reserva.findByIdAndUpdate(reserva._id, {
            recordatorio3hEnviado: true,
          });

          console.log(`✅ Recordatorio 3h enviado — ${cliente.nombre}`);
          await new Promise((r) => setTimeout(r, 500));
        } catch (error) {
          console.error(
            `❌ Error procesando reserva ${reserva._id}:`,
            error.message,
          );
        }
      }
    } catch (error) {
      console.error("❌ Error en enviarRecordatorios3h:", error);
    }
  }
  // Al final de la clase, antes del último }
  async testEnviar(reservaId) {
    try {
      const reserva = await Reserva.findById(reservaId)
        .populate("servicio", "nombre")
        .populate("barbero", "nombre apellido");

      if (!reserva) return { error: "Reserva no encontrada" };

      const resultado = await this.obtenerDatosReserva(reserva);
      if (!resultado) return { error: "Cliente no encontrado" };

      const { cliente, datos } = resultado;

      await this.enviarPorTodosLosCanales(cliente, datos, "24h");

      return {
        success: true,
        mensaje: `Enviado a ${cliente.email} y ${cliente.telefono}`,
      };
    } catch (error) {
      return { error: error.message };
    }
  }
}

export default new RecordatoriosJob();
