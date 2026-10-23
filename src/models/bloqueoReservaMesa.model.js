import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Tipos de bloqueo:
 *  - sin_reservas:  no se reciben reservas (cierre, evento privado, lluvia).
 *  - orden_llegada: el local abre, pero se atiende solo por orden de llegada
 *                   (fechas de alta demanda). La página pública lo anuncia.
 * Los bloqueos antiguos no traen tipo: cuentan como "sin_reservas".
 */
export const TIPOS_BLOQUEO_MESA = ["sin_reservas", "orden_llegada"];

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
    tipo: { type: String, enum: TIPOS_BLOQUEO_MESA, default: "sin_reservas" },
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
