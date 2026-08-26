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

    // Cuántas clases incluye el plan — su significado depende de tipoCiclo:
    // "mensual" → clasesIncluidas se resetea cada 30 días (ej. 12/mes durante
    // los duracionDias que dure el plan completo); "total" → clasesIncluidas
    // es un cupo único que no se renueva, válido para todo duracionDias.
    clasesIncluidas: { type: Number, required: true, min: 1 },

    precio: { type: Number, required: true, min: 0 },

    // Duración TOTAL del plan (ej. 90 = trimestral, 180 = semestral). Con
    // tipoCiclo "mensual" el cupo igual se renueva cada 30 días dentro de
    // este total; con "total" es un solo cupo para todo este período.
    duracionDias: { type: Number, default: 30, min: 1 },

    // "total" (por defecto, y el único comportamiento que existía antes de
    // este campo — se deja así para no alterar planes ya creados) = un cupo
    // fijo de clasesIncluidas para todo duracionDias, sin renovarse.
    // "mensual" = clasesIncluidas se renueva cada 30 días mientras dure el
    // plan (duracionDias en total). Ej. "12 clases/mes x 6 meses" = 180 días
    // + clasesIncluidas:12 + tipoCiclo:"mensual".
    tipoCiclo: { type: String, enum: ["total", "mensual"], default: "total" },

    activo: { type: Boolean, default: true },
  },
  { timestamps: true },
);

PlanMembresiaClaseSchema.index({ empresa: 1, activo: 1 });

export default mongoose.model("PlanMembresiaClase", PlanMembresiaClaseSchema);
