import mongoose from "mongoose";

const { Schema } = mongoose;

// Registro/bitácora de cada intento de pago online (Transbank WebPay Plus)
// de una mensualidad de clases grupales. Sirve para 3 cosas:
//  1) Idempotencia: si el callback de Transbank llega dos veces para el
//     mismo pago (reintento de red, el cliente recarga la página de
//     resultado), no se crea una MembresiaClase duplicada.
//  2) Auditoría: poder revisar pagos rechazados/errores sin depender solo
//     de los logs del servidor.
//  3) Saber a qué empresa (slug) redirigir de vuelta al cliente desde el
//     callback público de Transbank, que no lleva token de sesión.
const TransaccionMembresiaClaseSchema = new Schema(
  {
    empresa: {
      type: Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
      index: true,
    },
    // Guardado aparte para no tener que volver a consultar la empresa desde
    // el callback público (que no tiene sesión/JWT).
    empresaSlug: { type: String, required: true },

    cliente: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
      index: true,
    },

    plan: {
      type: Schema.Types.ObjectId,
      ref: "PlanMembresiaClase",
      default: null,
    },

    // Snapshot del plan al momento de iniciar el pago: si el admin edita o
    // borra el plan mientras el cliente está pagando, la mensualidad que se
    // cree usa estos datos "congelados", no el plan en su estado actual.
    nombrePlanSnapshot: { type: String, required: true },
    clasesIncluidasSnapshot: { type: Number, required: true },
    duracionDiasSnapshot: { type: Number, required: true },

    buyOrder: { type: String, required: true, unique: true, index: true },
    sessionId: { type: String, required: true },
    token: { type: String, required: true, index: true },
    monto: { type: Number, required: true },

    estado: {
      type: String,
      enum: ["iniciado", "aprobado", "rechazado", "cancelado", "error"],
      default: "iniciado",
      index: true,
    },

    // Se llena solo cuando el pago fue aprobado y se creó la mensualidad
    membresia: {
      type: Schema.Types.ObjectId,
      ref: "MembresiaClase",
      default: null,
    },

    respuestaTransbank: { type: Schema.Types.Mixed, default: null },
    error: { type: String, default: null },
  },
  { timestamps: true },
);

TransaccionMembresiaClaseSchema.index({ estado: 1, createdAt: -1 });

export default mongoose.model(
  "TransaccionMembresiaClase",
  TransaccionMembresiaClaseSchema,
);
