import { Schema, model } from "mongoose";

const NotificacionSchema = new Schema(
  {
    usuarioId: { type: Schema.Types.ObjectId, ref: "Usuario", required: true },
    barberoId: { type: Schema.Types.ObjectId, ref: "Barbero", required: true },
    fecha: { type: Date, required: true }, // aquí puedes guardar fecha+hora exacta
    enviado: { type: Boolean, default: false }, // si ya se envió la notificación
  },
  { timestamps: true }
);

export default model("Notificacion", NotificacionSchema);
