import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

class WhatsAppService {
  constructor() {
    this.accessToken = process.env.ACCESS_TOKEN;
    this.phoneNumberId = process.env.PHONE_NUMBER;

    if (!this.accessToken || !this.phoneNumberId) {
      console.error("❌ Faltan ACCESS_TOKEN o PHONE_NUMBER en .env");
    }

    this.apiUrl = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`;
  }

  /* =============================
     UTIL: formatear teléfono
     Convierte "912345678" → "56912345678"
  ============================== */
  formatearTelefono(telefono) {
    // Limpiar todo lo que no sea número
    let clean = telefono.replace(/\D/g, "");

    // Si empieza con 56 ya está bien
    if (clean.startsWith("56")) return clean;

    // Si empieza con 9 (Chile) agregar 56
    if (clean.startsWith("9")) return `56${clean}`;

    return clean;
  }

  /* =============================
     ENVIAR RECORDATORIO
  ============================== */
  async enviarRecordatorio({ nombreCliente, telefono, nombreBarbero, fecha, hora, servicio }) {
    try {
      const telefonoFormateado = this.formatearTelefono(telefono);

      const body = {
        messaging_product: "whatsapp",
        to: telefonoFormateado,
        type: "template",
        template: {
          name: "recordatorio_cita", // ← nombre exacto del template en Meta
         language: { code: "es_CL" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: nombreCliente },
                { type: "text", text: nombreBarbero },
                { type: "text", text: fecha },
                { type: "text", text: hora },
                { type: "text", text: servicio },
              ],
            },
          ],
        },
      };

      const res = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("❌ Error Meta API:", data);
        return { success: false, error: data };
      }

      console.log(`✅ Recordatorio enviado a ${telefonoFormateado}`);
      return { success: true, data };
    } catch (error) {
      console.error("❌ Error enviando WhatsApp:", error.message);
      return { success: false, error: error.message };
    }
  }
}

export default new WhatsAppService();
