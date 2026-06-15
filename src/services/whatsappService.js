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

      // 🔥 LOG 4: éxito claro

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
    telefonoCliente,
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
                { type: "text", text: nombreProfesional || "-" },
                { type: "text", text: nombreCliente || "-" },
                { type: "text", text: fecha || "-" },
                { type: "text", text: hora || "-" },
                { type: "text", text: servicio || "-" },
                { type: "text", text: telefonoCliente || "-" },
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

  async enviarRecordatorioPago({ telefono, nombreEmpresa }) {
    try {
      const telefonoFormateado = this.formatearTelefono(telefono);

      const body = {
        messaging_product: "whatsapp",
        to: telefonoFormateado,
        type: "template",
        template: {
          name: "recordatorio_pago",
          language: { code: "en" },
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text: nombreEmpresa || "-" }],
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
        console.error("❌ Error Meta API (recordatorio pago):", data);
        return { success: false, error: data };
      }

      return { success: true, data };
    } catch (error) {
      console.error("❌ Error enviando recordatorio pago:", error.message);
      return { success: false, error: error.message };
    }
  }

  /* =============================
   NOTIFICAR CLIENTE CANCELACIÓN
============================== */
  async enviarCancelacionCliente({
    telefono,
    nombreCliente,
    motivo,
    nombreProfesional,
    servicio,
    fecha,
    hora,
    direccion,
  }) {
    try {
      const telefonoFormateado = this.formatearTelefono(telefono);

      const body = {
        messaging_product: "whatsapp",
        to: telefonoFormateado,
        type: "template",
        template: {
          name: "cancelacion_reserva_profesional",
          language: { code: "es_CL" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: nombreCliente || "-" }, // nombre_cliente
                { type: "text", text: motivo || "-" }, // motivo
                { type: "text", text: nombreProfesional || "-" }, // nombre_profesional
                { type: "text", text: servicio || "-" }, // servicio
                { type: "text", text: fecha || "-" }, // fecha
                { type: "text", text: hora || "-" }, // hora
                { type: "text", text: direccion || "-" }, // direccion
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
        console.error("❌ Error Meta API (cancelación cliente):", data);
        return { success: false, error: data };
      }

      return { success: true, data };
    } catch (error) {
      console.error("❌ Error enviando cancelación al cliente:", error.message);
      return { success: false, error: error.message };
    }
  }
}

export default new WhatsAppService();
