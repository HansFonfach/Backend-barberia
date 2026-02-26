import { Schema, model } from "mongoose";

const NotificacionSchema = new Schema(
  {
    usuarioId: { type: Schema.Types.ObjectId, ref: "Usuario", required: true },
    barberoId: { type: Schema.Types.ObjectId, ref: "Usuario", required: true }, // 🔥 FIX
    fecha: { type: Date, required: true },
    enviado: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default model("Notificacion", NotificacionSchema);