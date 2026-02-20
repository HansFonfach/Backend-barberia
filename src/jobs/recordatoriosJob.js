import cron from "node-cron";
import WhatsAppService from "../services/whatsappService.js";
import Reserva from "../models/reserva.model.js";
import Usuario from "../models/usuario.model.js";

class RecordatoriosJob {
  init() {
    cron.schedule("* * * * *", async () => {
      await this.enviarRecordatoriosDelDia();
    });
  }
  async enviarRecordatoriosDelDia() {
    try {
      const hoy = new Date();
      const inicioDia = new Date(hoy);
      inicioDia.setHours(0, 0, 0, 0);

      const finDia = new Date(hoy);
      finDia.setHours(23, 59, 59, 999);

      const reservasHoy = await Reserva.find({
        fecha: {
          $gte: inicioDia,
          $lte: finDia,
        },
        estado: { $in: ["pendiente", "confirmada"] },
        recordatorioEnviado: false,
      }).populate("servicio", "nombre duracion"); // ✅ POPULAR SERVICIO

      for (const reserva of reservasHoy) {
        try {
          const cliente = await Usuario.findById(reserva.cliente);
          const barbero = await Usuario.findById(reserva.barbero);

          if (!cliente || !barbero) {
            continue;
          }

          if (!cliente.telefono) {
            continue;
          }

          // ✅ MEJORAR LOS DATOS ENVIADOS
          const resultado = await WhatsAppService.enviarRecordatorio({
            usuario: {
              nombre: cliente.nombre,
              telefono: cliente.telefono,
            },
            barbero: {
              nombre: barbero.nombre,
            },
            fecha: reserva.fecha,
            hora: reserva.hora || "No especificada", // ✅ VALOR POR DEFECTO
            servicio: reserva.servicio?.nombre || "Corte de pelo", // ✅ NOMBRE DEL SERVICIO
          });

          if (resultado.success) {
            await Reserva.findByIdAndUpdate(reserva._id, {
              recordatorioEnviado: true,
              fechaRecordatorio: new Date(),
            });
          } else {
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`❌ Error procesando reserva ${reserva._id}:`, error);
        }
      }
    } catch (error) {
      console.error("❌ Error en job de recordatorios:", error);
    }
  }

  // Para testing manual con ID real
  async enviarRecordatorioManual(reservaId) {
    try {
      const reserva = await Reserva.findById(reservaId);

      if (!reserva) {
        return { success: false, error: "Reserva no encontrada" };
      }

      // ✅ CORREGIDO: Usar reserva.cliente
      const cliente = await Usuario.findById(reserva.cliente);
      const barbero = await Usuario.findById(reserva.barbero);

      if (!cliente || !barbero) {
        return { success: false, error: "Cliente o barbero no encontrado" };
      }

      if (!cliente.telefono) {
        return { success: false, error: "Cliente no tiene teléfono" };
      }

      const resultado = await WhatsAppService.enviarRecordatorio({
        usuario: {
          nombre: cliente.nombre,
          telefono: cliente.telefono,
        },
        barbero: {
          nombre: barbero.nombre,
        },
        fecha: reserva.fecha,
        hora: reserva.hora,
      });

      if (resultado.success) {
        await Reserva.findByIdAndUpdate(reservaId, {
          recordatorioEnviado: true,
          fechaRecordatorio: new Date(),
        });
      }

      return resultado;
    } catch (error) {
      console.error("❌ Error en recordatorio manual:", error);
      return { success: false, error: error.message };
    }
  }
}

export default new RecordatoriosJob();
