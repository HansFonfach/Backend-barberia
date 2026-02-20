import mongoose from "mongoose";

const { Schema } = mongoose;

const ReservaSchema = new Schema(
  {
    empresa: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
    },
    cliente: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      required: false,
    },
    invitado: {
      nombre: { type: String },
      telefono: { type: String },
      email: { type: String },
      token: { type: String }, // UUID único para acceder/cancelar
    },
    barbero: { type: Schema.Types.ObjectId, ref: "Usuario", required: true },
    servicio: { type: Schema.Types.ObjectId, ref: "Servicio", required: true },

    fecha: { type: Date, required: true }, // inicio real
    duracion: { type: Number, required: true }, // ⬅️ NUEVO (minutos)

    estado: {
      type: String,
      enum: ["pendiente", "confirmada", "cancelada", "completada" ,"no_asistio"],
      default: "pendiente",
    },

    puntosOtorgados: { type: Number, default: 10 },
    puntosSumados: { type: Boolean, default: false },

    recordatorioEnviado: { type: Boolean, default: false },
    fechaRecordatorio: { type: Date },

    confirmacionUsuario: { type: Boolean, default: false },
    fechaConfirmacion: { type: Date },

    motivoCancelacion: { type: String },
    cancelToken: {
      type: String,
      default: null,
    },
    cancelTokenExpira: {
      type: Date,
    },
  },

  { timestamps: true },
);
ReservaSchema.index({ barbero: 1, fecha: 1, estado: 1 });
ReservaSchema.index({ empresa: 1, fecha: 1 });

export default mongoose.model("Reserva", ReservaSchema);
