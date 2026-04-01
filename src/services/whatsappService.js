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
    let clean = telefono.replace(/\D/g, "");

    // Si ya tiene código de país
    if (clean.startsWith("56")) return clean;

    // Número chileno completo (9 dígitos): 9XXXXXXXX
    if (clean.startsWith("9") && clean.length === 9) return `56${clean}`;

    // Número corto (8 dígitos): le falta el 9 inicial
    if (clean.length === 8) return `569${clean}`;

    return clean;
  }
  /* =============================
     ENVIAR RECORDATORIO
  ============================== */
  async enviarRecordatorio({
    nombreCliente,
    telefono,
    nombreEmpresa,
    nombreProfesional, // ← nuevo
    fecha,
    hora,
    servicio,
    direccion, // ← nuevo
  }) {
    try {
      const telefonoFormateado = this.formatearTelefono(telefono);

      const body = {
        messaging_product: "whatsapp",
        to: telefonoFormateado,
        type: "template",
        template: {
          name: "recordatorio3_cita",
          language: { code: "en" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: nombreCliente || "-" },
                { type: "text", text: nombreEmpresa || "-" },
                { type: "text", text: nombreProfesional || "-" }, // ← fallback
                { type: "text", text: fecha || "-" },
                { type: "text", text: hora || "-" },
                { type: "text", text: servicio || "-" },
                { type: "text", text: direccion || "-" }, // ← fallback
              ],
            },
          ],
        },
      };
      // ... resto igual
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

      return { success: true, data };
    } catch (error) {
      console.error("❌ Error enviando WhatsApp:", error.message);
      return { success: false, error: error.message };
    }
  }

  async enviarNotificacionProfesional({
    telefono,
    nombreProfesional,
    nombreCliente,
    fecha,
    hora,
    servicio,
    plantilla = "notificacion_cancelacion",
  }) {
    try {
      const telefonoFormateado = this.formatearTelefono(telefono);

      const body = {
        messaging_product: "whatsapp",
        to: telefonoFormateado,
        type: "template",
        template: {
          name: plantilla,
          language: { code: "es_CL" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: nombreProfesional },
                { type: "text", text: nombreCliente },
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
        console.error("❌ Error Meta API (profesional):", data);
        return { success: false, error: data };
      }

      return { success: true, data };
    } catch (error) {
      console.error("❌ Error enviando WhatsApp profesional:", error.message);
      return { success: false, error: error.message };
    }
  }
}

export default new WhatsAppService();
