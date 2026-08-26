import mongoose from "mongoose";

const { Schema } = mongoose;

// Mensualidad de clases grupales: NO es acceso ilimitado, es un cupo fijo de
// clases al mes según el plan contratado (ej. plan de 8 clases). Es un modelo
// aparte de Suscripcion (esa está pensada para créditos de cortes/barba de la
// barbería); así no se mezclan ni se afecta esa lógica.
const MembresiaClaseSchema = new Schema(
  {
    empresa: {
      type: Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
      index: true,
    },

    cliente: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
      index: true,
    },

    // Referencia al plan contratado (puede quedar huérfana si el plan se
    // borra más adelante; para eso está el snapshot de abajo)
    plan: {
      type: Schema.Types.ObjectId,
      ref: "PlanMembresiaClase",
      default: null,
    },

    // Snapshot del plan al momento de suscribir (no cambia si el admin
    // después edita o borra el plan original)
    nombrePlan: { type: String, required: true },
    clasesIncluidas: { type: Number, required: true, min: 1 },
    // Snapshot de PlanMembresiaClase.tipoCiclo — default "total" a propósito:
    // así las mensualidades ya vendidas antes de este campo (que en la
    // práctica siempre funcionaron como cupo total, nunca mensual) se siguen
    // contando exactamente igual que antes, sin cambiar nada retroactivo.
    tipoCiclo: { type: String, enum: ["total", "mensual"], default: "total" },
    precio: { type: Number, default: 0 },

    activa: { type: Boolean, default: true, index: true },

    fechaInicio: { type: Date, default: Date.now },
    fechaFin: { type: Date, required: true },

    historial: { type: Boolean, default: false },

    // Control de envío de correos del ciclo de vida (evita duplicados)
    recordatorio5dEnviado: { type: Boolean, default: false },
    recordatorioDiaEnviado: { type: Boolean, default: false },
    recordatorioWinbackEnviado: { type: Boolean, default: false },
  },
  { timestamps: true },
);

MembresiaClaseSchema.index({ empresa: 1, cliente: 1, activa: 1 });

export default mongoose.model("MembresiaClase", MembresiaClaseSchema);
