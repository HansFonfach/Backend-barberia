import mongoose from "mongoose";

const { Schema } = mongoose;

// Catálogo de planes mensuales de clases grupales (ej. "Plan 8 clases",
// "Plan 12 clases"). El admin los crea/edita/desactiva desde aquí.
// Cada MembresiaClase guarda un snapshot de estos datos al momento de
// suscribir a un cliente (mismo patrón que Reserva.servicioSnapshot), para
// que una mensualidad ya vendida no cambie si después el admin edita o
// borra el plan.
const PlanMembresiaClaseSchema = new Schema(
  {
    empresa: {
      type: Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
      index: true,
    },

    nombre: { type: String, required: true }, // ej. "Plan 8 clases"

    // Cuántas clases al mes incluye este plan (no es ilimitado)
    clasesIncluidas: { type: Number, required: true, min: 1 },

    precio: { type: Number, required: true, min: 0 },

    // Duración del ciclo, por defecto mensual (30 días)
    duracionDias: { type: Number, default: 30, min: 1 },

    activo: { type: Boolean, default: true },
  },
  { timestamps: true },
);

PlanMembresiaClaseSchema.index({ empresa: 1, activo: 1 });

export default mongoose.model("PlanMembresiaClase", PlanMembresiaClaseSchema);
