import mongoose from "mongoose";

const { Schema } = mongoose;

export const ESTADOS_CAMPANA_MESA = ["enviando", "enviada", "con_errores", "interrumpida"];

/** Promoción enviada por correo a los clientes que aceptaron recibirlas. */
const CampanaReservaMesaSchema = new Schema(
  {
    empresa: { type: Schema.Types.ObjectId, ref: "Empresa", required: true, index: true },
    asunto: { type: String, required: true, trim: true, maxlength: 120 },
    mensaje: { type: String, required: true, maxlength: 3000 },
    creadoPor: {
      id: { type: Schema.Types.ObjectId, ref: "Usuario", default: null },
      nombre: { type: String, default: "" },
    },
    estado: { type: String, enum: ESTADOS_CAMPANA_MESA, default: "enviando" },
    destinatarios: { type: Number, default: 0 },
    enviados: { type: Number, default: 0 },
    fallidos: { type: Number, default: 0 },
    terminadaEn: { type: Date, default: null },
  },
  { timestamps: true },
);

CampanaReservaMesaSchema.index({ empresa: 1, createdAt: -1 });

export default mongoose.model("CampanaReservaMesa", CampanaReservaMesaSchema, "campanasReservaMesa");
