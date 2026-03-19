import { Schema, model } from "mongoose";

const NotificacionSchema = new Schema(
  {
    usuarioId: { type: Schema.Types.ObjectId, ref: "Usuario", required: false }, // ya no required
    barberoId: { type: Schema.Types.ObjectId, ref: "Usuario", required: true },
    fecha: { type: Date, required: true },
    enviado: { type: Boolean, default: false },
    emailInvitado: { type: String, default: null },   // ← nuevo
    esInvitado: { type: Boolean, default: false },    // ← nuevo
  },
  { timestamps: true }
);

export default model("Notificacion", NotificacionSchema);