import mongoose from "mongoose";

const { Schema } = mongoose;

// Excepción puntual sobre una fecha concreta de una Clase recurrente:
// cancelar esa sesión o cambiarle el cupo, sin tocar la plantilla semanal.
const ExcepcionClaseSchema = new Schema(
  {
    clase: {
      type: Schema.Types.ObjectId,
      ref: "Clase",
      required: true,
      index: true,
    },

    // Día de la sesión afectada, normalizado a las 00:00 (zona America/Santiago)
    fecha: { type: Date, required: true, index: true },

    tipo: {
      type: String,
      enum: ["cancelada", "cupo_modificado"],
      required: true,
    },

    // Solo aplica cuando tipo === "cupo_modificado"
    cupoOverride: { type: Number, default: null, min: 0 },

    motivo: { type: String, default: "" },
  },
  { timestamps: true },
);

ExcepcionClaseSchema.index({ clase: 1, fecha: 1 }, { unique: true });

export default mongoose.model("ExcepcionClase", ExcepcionClaseSchema);
