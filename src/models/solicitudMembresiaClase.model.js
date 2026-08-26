import mongoose from "mongoose";

const { Schema } = mongoose;

// Solicitud de mensualidad de clases grupales: el cliente elige un plan y
// cómo va a pagar (transferencia o efectivo). Si es transferencia, sube un
// comprobante. La solicitud queda "pendiente" hasta que el dueño del
// gimnasio la revisa y la aprueba (ahí recién se crea la MembresiaClase real)
// o la rechaza. No hay pasarela de pago de por medio: el dinero se mueve
// fuera del sistema, esto solo ordena el aviso + comprobante + activación.
const SolicitudMembresiaClaseSchema = new Schema(
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

    // Referencia al plan solicitado (puede quedar huérfana si el plan se
    // borra más adelante; para eso está el snapshot de abajo)
    plan: {
      type: Schema.Types.ObjectId,
      ref: "PlanMembresiaClase",
      default: null,
    },

    // Snapshot del plan al momento de solicitar (mismo patrón que
    // MembresiaClase.nombrePlan/clasesIncluidas/precio): si el admin edita o
    // borra el plan después, esta solicitud no cambia.
    nombrePlan: { type: String, required: true },
    clasesIncluidas: { type: Number, required: true, min: 1 },
    duracionDias: { type: Number, required: true, min: 1 },
    tipoCiclo: { type: String, enum: ["total", "mensual"], default: "total" },
    precio: { type: Number, required: true, min: 0 },

    metodo: {
      type: String,
      enum: ["transferencia", "efectivo", "whatsapp"],
      required: true,
    },

    // Solo se completa cuando metodo === "transferencia" (o si mandaron el
    // comprobante igual con metodo "whatsapp"); con "efectivo" queda vacío.
    comprobante: {
      url: { type: String, default: "" },
      publicId: { type: String, default: "" },
    },

    estado: {
      type: String,
      enum: ["pendiente", "aprobada", "rechazada"],
      default: "pendiente",
      index: true,
    },

    motivoRechazo: { type: String, default: "" },

    // Se completa recién cuando el admin aprueba la solicitud
    membresiaCreada: {
      type: Schema.Types.ObjectId,
      ref: "MembresiaClase",
      default: null,
    },

    resueltoPor: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      default: null,
    },
    fechaResolucion: { type: Date, default: null },

    // Recordatorio automático para solicitudes que llevan mucho tiempo
    // pendientes de revisión (ver cron/membresiaClaseCron.js)
    recordatorioPendienteEnviado: { type: Boolean, default: false },
  },
  { timestamps: true },
);

SolicitudMembresiaClaseSchema.index({ empresa: 1, estado: 1, createdAt: -1 });

export default mongoose.model(
  "SolicitudMembresiaClase",
  SolicitudMembresiaClaseSchema,
);
