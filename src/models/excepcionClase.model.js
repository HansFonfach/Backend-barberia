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
      // "forzar_habilitada": mantiene esta clase/fecha funcionando aunque el
      // día completo esté bloqueado por feriado a nivel de empresa (ver
      // FeriadoClaseBloqueo) — no tiene efecto si el día no está bloqueado.
      enum: ["cancelada", "cupo_modificado", "forzar_habilitada"],
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
