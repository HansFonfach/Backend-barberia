import mongoose from "mongoose";

const { Schema } = mongoose;

const ReservaSchema = new Schema(
  {
    cliente: { type: Schema.Types.ObjectId, ref: "Usuario", required: true },
    barbero: { type: Schema.Types.ObjectId, ref: "Usuario", required: true },
    servicio: { type: Schema.Types.ObjectId, ref: "Servicio", required: true },
    fecha: { type: Date, required: true }, // fecha + hora exacta
    estado: {
      type: String,
      enum: ["pendiente", "confirmada", "cancelada", "completada"],
      default: "pendiente",
    },
    // ✅ NUEVOS CAMPOS PARA WHATSAPP
    recordatorioEnviado: {
      type: Boolean,
      default: false,
    },
    fechaRecordatorio: {
      type: Date,
    },
    confirmacionUsuario: {
      type: Boolean,
      default: false,
    },
    fechaConfirmacion: {
      type: Date,
    },
    motivoCancelacion: {
      type: String,
    },
  },

  { timestamps: true }
);

export default mongoose.model("Reserva", ReservaSchema);
