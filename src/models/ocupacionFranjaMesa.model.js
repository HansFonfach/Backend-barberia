import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Contador de personas reservadas por sector y franja de 15 minutos.
 *
 * Existe para poder tomar cupo con una operación atómica de Mongo ($inc
 * condicionado) en vez de "contar reservas y después crear", que deja pasar
 * a dos personas que piden el último lugar al mismo tiempo. Mismo patrón que
 * cupoSesion.model.js de las clases grupales.
 *
 * Si algún día los contadores se desalinean de las reservas (por un corte a
 * mitad de una operación), `recalcular-ocupacion-mesas.js` los reconstruye.
 */
const OcupacionFranjaMesaSchema = new Schema(
  {
    empresa: { type: Schema.Types.ObjectId, ref: "Empresa", required: true },
    sector: { type: Schema.Types.ObjectId, required: true },
    franja: { type: Date, required: true }, // inicio de la franja (UTC)
    personas: { type: Number, default: 0 },
  },
  { timestamps: false },
);

OcupacionFranjaMesaSchema.index(
  { empresa: 1, sector: 1, franja: 1 },
  { unique: true },
);

export default mongoose.model(
  "OcupacionFranjaMesa",
  OcupacionFranjaMesaSchema,
  "ocupacionFranjasMesa",
);
