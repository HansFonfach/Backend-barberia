import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Bloqueo puntual de reservas: un día completo, un sector en un día (terraza
 * con lluvia) o un tramo de horas (evento privado). Impide reservas NUEVAS;
 * las ya tomadas no se tocan solas: el panel las muestra para decidir qué
 * hacer con ellas.
 */
const BloqueoReservaMesaSchema = new Schema(
  {
    empresa: {
      type: Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
      index: true,
    },
    fecha: { type: String, required: true }, // "YYYY-MM-DD", día de Chile
    sector: { type: Schema.Types.ObjectId, default: null }, // null = todo el local
    horaDesde: { type: String, default: null }, // "HH:mm"; null = día completo
    horaHasta: { type: String, default: null },
    motivo: { type: String, default: "", maxlength: 200 },
    creadoPor: { type: Schema.Types.ObjectId, ref: "Usuario", default: null },
  },
  { timestamps: true },
);

BloqueoReservaMesaSchema.index({ empresa: 1, fecha: 1 });

export default mongoose.model(
  "BloqueoReservaMesa",
  BloqueoReservaMesaSchema,
  "bloqueosReservaMesa",
);
