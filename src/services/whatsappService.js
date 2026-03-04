// ✅ CARGAR DOTENV TAMBIÉN AQUÍ
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env desde la raíz del proyecto
const envPath = path.resolve(__dirname, "..", "..", ".env");
dotenv.config({ path: envPath });



import twilio from "twilio";

class WhatsAppService {
  constructor() {
   

    // Verificar credenciales
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      console.error("❌ CREDENCIALES TWILIO FALTANTES EN SERVICIO:");
      console.error("TWILIO_ACCOUNT_SID:", process.env.TWILIO_ACCOUNT_SID);
      console.error("TWILIO_AUTH_TOKEN:", process.env.TWILIO_AUTH_TOKEN);
      console.error(
        "TWILIO_WHATSAPP_NUMBER:",
        process.env.TWILIO_WHATSAPP_NUMBER
      );
      throw new Error("Credenciales de Twilio no configuradas en servicio");
    }

    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    this.sandboxNumber = process.env.TWILIO_WHATSAPP_NUMBER;
  }

  async enviarRecordatorio(reserva) {
    try {
      const mensaje = this.crearMensajeRecordatorio(reserva);

      const message = await this.client.messages.create({
        body: mensaje,
        from: `whatsapp:${this.sandboxNumber}`,
        to: `whatsapp:${reserva.usuario.telefono}`,
      });

      return { success: true, messageId: message.sid };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  crearMensajeRecordatorio(reserva) {
    return `💈 *Recordatorio La Santa Barberia*\n\nHola ${reserva.usuario.nombre}!  Te escribimos para recordarte que tienes una hora agendada con los siguientes datos:
    

 *Fecha:* Hoy
 *Hora:* ${reserva.fecha}
 *Barbero:* ${reserva.barbero.nombre}
 *Servicio:* ${reserva.servicio}

📍 *Ubicación:* Calle portales nº 310

¿Confirmas tu asistencia?

✅ *Sí, asistiré*
❌ *No podré asistir*

_Responde con Si o No dentro de las próximas 2 horas_`;
  }

  async enviarConfirmacion(telefono, nombre) {
    const mensaje = `¡Gracias por confirmar, ${nombre}! 

Te esperamos en la barbería.`;

    return await this.client.messages.create({
      body: mensaje,
      from: `whatsapp:${this.sandboxNumber}`,
      to: `whatsapp:${telefono}`,
    });
  }

  async enviarCancelacion(telefono, nombre) {
    const mensaje = `Entendido, ${nombre}. Hemos cancelado tu reserva. 

¡Esperamos verte pronto! 💈`;

    return await this.client.messages.create({
      body: mensaje,
      from: `whatsapp:${this.sandboxNumber}`,
      to: `whatsapp:${telefono}`,
    });
  }
}

export default new WhatsAppService();
