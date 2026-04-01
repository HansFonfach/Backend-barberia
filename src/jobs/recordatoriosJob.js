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
      await this.enviarRecordatorios24h();
      await this.enviarRecordatorios3h();
    });
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
        nombreEmpresa: reserva.empresa?.nombre || "La Barbería",
        servicio: reserva.servicio?.nombre || "Servicio",
        fecha: fechaChile.format("DD/MM/YYYY"),
        hora: fechaChile.format("HH:mm"),
        direccion: reserva.empresa?.direccion || null, // ✅ agregar esto
        horasLimite: reserva.empresa?.politicaCancelacion?.horasLimite ?? null,
        telefonoEmpresa: reserva.empresa?.telefono ?? null, // ← de empresa, no barbero
      },
    };
  }

  /* =============================
     ENVIAR POR EMAIL + WHATSAPP (controlado)
  ============================== */
  async enviarPorTodosLosCanales(
    cliente,
    datos,
    tipo,
    reserva,
    enviarWhatsApp = true,
  ) {
    // 📧 Email
    if (cliente.email) {
      try {
        const resEmail = await sendReminderEmail(cliente.email, {
          ...datos,
          tipo,
          instrucciones: reserva.servicio?.instrucciones ?? null,
        });
      } catch (err) {
        console.error(`❌ Error email ${cliente.email}:`, err.message);
      }
    }

    // 💬 WhatsApp (solo si está habilitado)
    if (enviarWhatsApp && cliente.telefono) {
      await WhatsAppService.enviarRecordatorio({
        ...datos,
        telefono: cliente.telefono,
      }).catch((err) =>
        console.error(`❌ Error WhatsApp ${cliente.telefono}:`, err.message),
      );
    }
  }

  /* =============================
     RECORDATORIO 24 HORAS ANTES (SIN WHATSAPP)
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
        .populate("servicio", "nombre instrucciones")
        .populate("barbero", "nombre apellido")
        .populate("empresa", "nombre direccion telefono politicaCancelacion")

      for (const reserva of reservas) {
        try {
          const resultado = await this.obtenerDatosReserva(reserva);
          if (!resultado) continue;

          const { cliente, datos } = resultado;

          // Generar token de confirmación
          const token = crypto.randomUUID();
          const baseUrl =
            process.env.FRONTEND_URL || "https://www.agendafonfach.cl";

          await Reserva.findByIdAndUpdate(reserva._id, {
            recordatorioEnviado: true,
            fechaRecordatorio: new Date(),
            confirmacionAsistenciaEnviada: true,
            "confirmacionAsistencia.solicitada": true,
            "confirmacionAsistencia.token": token,
            "confirmacionAsistencia.enviadaEn": new Date(),
          });

          // Pasar los URLs al email
          await this.enviarPorTodosLosCanales(
            cliente,
            {
              ...datos,
              confirmarUrl: `${baseUrl}/confirmacion/${token}?respuesta=confirma`,
              cancelarUrl: `${baseUrl}/confirmacion/${token}?respuesta=cancela`,
            },
            "24h",
            reserva,
            false,
          );

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
     RECORDATORIO 3 HORAS ANTES (CON WHATSAPP)
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
        .populate("servicio", "nombre instrucciones")
        .populate("barbero", "nombre apellido")
       .populate("empresa", "nombre direccion telefono politicaCancelacion")

      for (const reserva of reservas) {
        try {
          const resultado = await this.obtenerDatosReserva(reserva);
          if (!resultado) continue;

          const { cliente, datos } = resultado;

          // ✅ CON WhatsApp
          const yaActualizada = await Reserva.findOneAndUpdate(
            { _id: reserva._id, recordatorio3hEnviado: { $ne: true } },
            { recordatorio3hEnviado: true },
            { new: true },
          );

          if (!yaActualizada) {
            continue;
          }

          // ✅ CON WhatsApp (solo llega aquí si nadie más la procesó)
          await this.enviarPorTodosLosCanales(
            cliente,
            datos,
            "3h",
            reserva,
            true,
          );

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

  /* =============================
     TEST MANUAL
  ============================== */
  async testEnviar(reservaId) {
    try {
      const reserva = await Reserva.findById(reservaId)
        .populate("servicio", "nombre instrucciones")
        .populate("barbero", "nombre apellido")
        .populate("empresa", "nombre");

      if (!reserva) return { error: "Reserva no encontrada" };

      const resultado = await this.obtenerDatosReserva(reserva);
      if (!resultado) return { error: "Cliente no encontrado" };

      const { cliente, datos } = resultado;

      // 👉 Aquí puedes probar con o sin WhatsApp
      await this.enviarPorTodosLosCanales(cliente, datos, "24h", reserva, true);

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
