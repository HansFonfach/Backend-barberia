import cron from "node-cron";
import Reserva from "../models/reserva.model.js";
import Usuario from "../models/usuario.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { sendReminderEmail } from "../controllers/mailController.js";
import WhatsAppService from "../services/whatsappService.js";
import crypto from "crypto";

dayjs.extend(utc);
dayjs.extend(timezone);

class RecordatoriosJob {
  init() {
    console.log("🚀 Iniciando CRON de recordatorios...");

    cron.schedule("*/15 * * * *", async () => {
      console.log("⏰ Ejecutando CRON:", new Date().toISOString());

      await this.enviarRecordatorios24h();
      await this.enviarRecordatorios14h();
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

    if (!cliente) {
      console.warn("⚠️ Cliente no encontrado:", reserva._id);
      return null;
    }

    const fechaChile = dayjs(reserva.fecha).tz("America/Santiago");

    const hora = fechaChile.hour();
    const minuto = fechaChile.minute();

    const esHorarioTemprano =
      hora === 8 || hora === 9 || (hora === 10 && minuto <= 30);

    return {
      cliente,
      esHorarioTemprano, // 👈 🔥 FALTABA ESTO
      datos: {
        nombreCliente: cliente.nombre,
        nombreBarbero:
          `${reserva.barbero?.nombre} ${reserva.barbero?.apellido || ""}`.trim(),
        nombreEmpresa: reserva.empresa?.nombre || "La Barbería",
        servicio: reserva.servicio?.nombre || "Servicio",
        fecha: fechaChile.format("DD/MM/YYYY"),
        hora: fechaChile.format("HH:mm"),
        direccion: reserva.empresa?.direccion || null,
        horasLimite: reserva.empresa?.politicaCancelacion?.horasLimite ?? null,
        telefonoEmpresa: reserva.empresa?.telefono ?? null,
      },
    };
  }

  /* =============================
     ENVIAR POR TODOS LOS CANALES
  ============================== */
  async enviarPorTodosLosCanales(
    cliente,
    datos,
    tipo,
    reserva,
    enviarWhatsApp = true,
  ) {
    console.log(`📨 Enviando ${tipo} → Reserva ${reserva._id}`);

    // 📧 EMAIL
    if (cliente.email && tipo !== "3h" && tipo !== "14h") {
      try {
        console.log("📧 Enviando email a:", cliente.email);

        await sendReminderEmail(cliente.email, {
          ...datos,
          tipo,
          instrucciones: reserva.servicio?.instrucciones ?? null,
        });

        console.log("✅ Email enviado:", cliente.email);
      } catch (err) {
        console.error(`❌ Error email ${cliente.email}:`, err.message);
      }
    }

    // 💬 WHATSAPP
    if (enviarWhatsApp && cliente.telefono) {
      try {
        console.log("💬 Enviando WhatsApp a:", cliente.telefono);

        const res = await WhatsAppService.enviarRecordatorio({
          ...datos,
          telefono: cliente.telefono,
          nombreProfesional: datos.nombreBarbero,
          slugEmpresa: reserva.empresa?.slug || "", // 👈 agregar esto
        });

        if (res.success) {
          console.log("✅ WhatsApp enviado:", cliente.telefono);
        } else {
          console.error("❌ Falló WhatsApp:", res.error);
        }
      } catch (err) {
        console.error(`❌ Error WhatsApp ${cliente.telefono}:`, err.message);
      }
    } else {
      console.warn("⚠️ WhatsApp no enviado (condición):", {
        enviarWhatsApp,
        telefono: cliente.telefono,
      });
    }
  }

  async enviarRecordatorios14h() {
    const ahora = dayjs().utc();

    // ✅ Ventana ajustada a ±7 min para que no haya overlap entre ticks
    const desde = ahora.add(13, "hour").add(53, "minute").toDate();
    const hasta = ahora.add(14, "hour").add(7, "minute").toDate();

    const reservas = await Reserva.find({
      fecha: { $gte: desde, $lte: hasta },
      estado: { $in: ["pendiente", "confirmada"] },
      recordatorio14hEnviado: { $ne: true },
    }); // ...populates

    for (const reserva of reservas) {
      const resultado = await this.obtenerDatosReserva(reserva);
      if (!resultado) continue;

      const { cliente, datos, esHorarioTemprano } = resultado;
      if (!esHorarioTemprano) continue;

      // ✅ Marcar ANTES de enviar (ya lo tienes, está bien)
      const yaActualizada = await Reserva.findOneAndUpdate(
        { _id: reserva._id, recordatorio14hEnviado: { $ne: true } },
        { recordatorio14hEnviado: true },
        { new: true },
      );

      if (!yaActualizada) continue;

      await this.enviarPorTodosLosCanales(cliente, datos, "14h", reserva, true);
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  /* =============================
     RECORDATORIO 24H
  ============================== */
  async enviarRecordatorios24h() {
    try {
      console.log("🔍 Buscando recordatorios 24h...");

      const ahora = dayjs().utc();
      const desde = ahora.add(23, "hour").toDate();
      const hasta = ahora.add(25, "hour").toDate();

      const reservas = await Reserva.find({
        fecha: { $gte: desde, $lte: hasta },
        estado: { $in: ["pendiente", "confirmada"] },
        recordatorioEnviado: { $ne: true },
      })
        .populate("servicio", "nombre instrucciones")
        .populate("barbero", "nombre apellido")
        .populate(
          "empresa",
          "nombre direccion telefono politicaCancelacion slug",
        );

      console.log(`📊 Reservas encontradas (24h): ${reservas.length}`);

      for (const reserva of reservas) {
        try {
          console.log("➡️ Procesando reserva:", reserva._id);

          const resultado = await this.obtenerDatosReserva(reserva);
          if (!resultado) continue;

          const { cliente, datos } = resultado;

          const token = crypto.randomUUID();
          const baseUrl =
            process.env.FRONTEND_URL || "https://www.agendafonfach.cl";
          const slug = reserva.empresa?.slug || ""; // ✅ agregado slug

          console.log("🔐 Token generado:", token);

          // ✅ PRIMERO ENVÍAS
          await this.enviarPorTodosLosCanales(
            cliente,
            {
              ...datos,
              confirmarUrl: `${baseUrl}/${slug}/confirmar-reserva?token=${token}&respuesta=confirma`,
              cancelarUrl: `${baseUrl}/${slug}/confirmar-reserva?token=${token}&respuesta=cancela`,
            },
            "24h",
            reserva,
            false,
          );

          // ✅ DESPUÉS MARCAS COMO ENVIADO
          await Reserva.findByIdAndUpdate(reserva._id, {
            recordatorioEnviado: true,
            fechaRecordatorio: new Date(),
            confirmacionAsistenciaEnviada: true,
            "confirmacionAsistencia.solicitada": true,
            "confirmacionAsistencia.token": token,
            "confirmacionAsistencia.enviadaEn": new Date(),
          });

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
     RECORDATORIO 3H
  ============================== */
  async enviarRecordatorios3h() {
    try {
      console.log("🔍 Buscando recordatorios 3h...");

      const ahora = dayjs().utc();
      const desde = ahora.add(2, "hour").add(45, "minute").toDate();
      const hasta = ahora.add(3, "hour").add(15, "minute").toDate();

      const reservas = await Reserva.find({
        fecha: { $gte: desde, $lte: hasta },
        estado: { $in: ["pendiente", "confirmada"] },
        recordatorio3hEnviado: { $ne: true },
      })
        .populate("servicio", "nombre instrucciones")
        .populate("barbero", "nombre apellido")
        .populate(
          "empresa",
          "nombre direccion telefono politicaCancelacion slug",
        );

      console.log(`📊 Reservas encontradas (3h): ${reservas.length}`);

      for (const reserva of reservas) {
        try {
          console.log("➡️ Procesando reserva:", reserva._id);

          const resultado = await this.obtenerDatosReserva(reserva);
          if (!resultado) continue;

          const { cliente, datos, esHorarioTemprano } = resultado;

          // 🔥 AGREGAR ACÁ ↓
          if (esHorarioTemprano) {
            console.log(
              "⏭️ Horario temprano, omitiendo recordatorio 3h completamente",
            );
            await Reserva.findOneAndUpdate(
              { _id: reserva._id, recordatorio3hEnviado: { $ne: true } },
              { recordatorio3hEnviado: true },
              { new: true },
            );
            continue;
          }
          // 🔥 FIN DEL AGREGADO ↑

          const yaActualizada = await Reserva.findOneAndUpdate(
            { _id: reserva._id, recordatorio3hEnviado: { $ne: true } },
            { recordatorio3hEnviado: true },
            { new: true },
          );

          if (!yaActualizada) {
            console.warn("⚠️ Ya fue procesada por otro proceso");
            continue;
          }

          await this.enviarPorTodosLosCanales(
            cliente,
            datos,
            "3h",
            reserva,
            !esHorarioTemprano,
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
      console.log("🧪 TEST envío manual:", reservaId);

      const reserva = await Reserva.findById(reservaId)
        .populate("servicio", "nombre instrucciones")
        .populate("barbero", "nombre apellido")
        .populate("empresa", "nombre direccion telefono");

      if (!reserva) return { error: "Reserva no encontrada" };

      const resultado = await this.obtenerDatosReserva(reserva);
      if (!resultado) return { error: "Cliente no encontrado" };

      const { cliente, datos } = resultado;

      await this.enviarPorTodosLosCanales(
        cliente,
        datos,
        "test",
        reserva,
        true,
      );

      return {
        success: true,
        mensaje: `Enviado a ${cliente.email} y ${cliente.telefono}`,
      };
    } catch (error) {
      console.error("❌ Error en testEnviar:", error);
      return { error: error.message };
    }
  }
}

export default new RecordatoriosJob();
