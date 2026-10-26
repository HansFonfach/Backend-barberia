import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Cliente de un local con reservas de mesa (uno por teléfono y empresa).
 * Se crea o actualiza cada vez que reserva. Guarda sobre todo el permiso
 * para enviarle promociones: quién lo dio, cuándo y si se dio de baja.
 * Las estadísticas (reservas, visitas, no asistió) se calculan desde las
 * reservas, no se guardan acá.
 */
const ClienteReservaMesaSchema = new Schema(
  {
    empresa: { type: Schema.Types.ObjectId, ref: "Empresa", required: true, index: true },
    telefonoNormalizado: { type: String, required: true },
    nombre: { type: String, trim: true, maxlength: 80, default: "" },
    telefono: { type: String, trim: true, maxlength: 25, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },

    promociones: {
      acepta: { type: Boolean, default: false },
      aceptoEn: { type: Date, default: null },
      origen: { type: String, enum: ["web", "panel", null], default: null },
      bajaEn: { type: Date, default: null },
      actualizadoPor: { type: String, default: "" }, // "cliente (web)", nombre del usuario del panel...
    },

    // Para el link "no quiero recibir más promociones" de cada correo
    tokenBaja: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);

ClienteReservaMesaSchema.index({ empresa: 1, telefonoNormalizado: 1 }, { unique: true });
ClienteReservaMesaSchema.index({ empresa: 1, "promociones.acepta": 1 });

export default mongoose.model("ClienteReservaMesa", ClienteReservaMesaSchema, "clientesReservaMesa");
