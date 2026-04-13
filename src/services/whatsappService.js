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
  ============================== */
  formatearTelefono(telefono) {
    let clean = telefono.replace(/\D/g, "");

    if (clean.startsWith("56")) return clean;
    if (clean.startsWith("9") && clean.length === 9) return `56${clean}`;
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
    nombreProfesional,
    fecha,
    hora,
    servicio,
    direccion,
    slugEmpresa, // 👈 agrega este parámetro
  }) {
    try {
      const telefonoFormateado = this.formatearTelefono(telefono);

      console.log("📤 Enviando recordatorio WhatsApp...");
      console.log({
        nombreCliente,
        telefono,
        telefonoFormateado,
        nombreEmpresa,
        nombreProfesional,
        fecha,
        hora,
        servicio,
        direccion,
        slugEmpresa,
      });

      // 👇 Lógica para elegir plantilla según slug
      const esLumyca = slugEmpresa === "lumicabeauty";
      const templateName = esLumyca
        ? "recordatorio_lumyca"
        : "recordatorio3_cita";
      const languageCode = esLumyca ? "en" : "en"; // ambas en "en" según lo que indicaste

      const body = {
        messaging_product: "whatsapp",
        to: telefonoFormateado,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: nombreCliente || "-" },
                { type: "text", text: nombreEmpresa || "-" },
                { type: "text", text: nombreProfesional || "-" },
                { type: "text", text: fecha || "-" },
                { type: "text", text: hora || "-" },
                { type: "text", text: servicio || "-" },
                { type: "text", text: direccion || "-" },
              ],
            },
          ],
        },
      };

      // 🔥 LOG 2: Body enviado
      console.log("📦 Body enviado a Meta:");
      console.log(JSON.stringify(body, null, 2));

      const res = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      // 🔥 LOG 3: Status + respuesta
      console.log("📊 Status:", res.status);
      console.log("📥 Respuesta Meta:", data);

      if (!res.ok) {
        console.error("❌ Error Meta API:", data);
        return { success: false, error: data };
      }

      // 🔥 LOG 4: éxito claro
      console.log(
        `✅ WhatsApp enviado correctamente a ${telefonoFormateado} (${nombreCliente})`,
      );

      return { success: true, data };
    } catch (error) {
      console.error("❌ Error enviando WhatsApp:", error.message);
      return { success: false, error: error.message };
    }
  }

  /* =============================
     NOTIFICAR PROFESIONAL
  ============================== */
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

      console.log("📤 Enviando notificación a profesional...");
      console.log({
        telefonoFormateado,
        nombreProfesional,
        nombreCliente,
        fecha,
        hora,
        servicio,
        plantilla,
      });

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
                { type: "text", text: nombreProfesional || "-" },
                { type: "text", text: nombreCliente || "-" },
                { type: "text", text: fecha || "-" },
                { type: "text", text: hora || "-" },
                { type: "text", text: servicio || "-" },
              ],
            },
          ],
        },
      };

      console.log("📦 Body profesional:");
      console.log(JSON.stringify(body, null, 2));

      const res = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      console.log("📊 Status:", res.status);
      console.log("📥 Respuesta Meta:", data);

      if (!res.ok) {
        console.error("❌ Error Meta API (profesional):", data);
        return { success: false, error: data };
      }

      console.log(
        `✅ Notificación enviada al profesional ${nombreProfesional}`,
      );

      return { success: true, data };
    } catch (error) {
      console.error("❌ Error enviando WhatsApp profesional:", error.message);
      return { success: false, error: error.message };
    }
  }
}

export default new WhatsAppService();
