import axios from "axios";

const PHONE_NUMBER_ID = "1056738067518808";
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN;

export const enviarRecordatorioCita = async ({ telefono, nombre, negocio, fecha, hora, servicio }) => {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: telefono,
        type: "template",
        template: {
          name: "recodatorio_cita",
          language: { code: "es_CL" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: nombre },
                { type: "text", text: negocio },
                { type: "text", text: fecha },
                { type: "text", text: hora },
                { type: "text", text: servicio },
              ],
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error WhatsApp:", error.response?.data || error.message);
    throw error;
  }
};
```

**`.env`:**
```
WHATSAPP_TOKEN=tu_access_token_aqui