// models/suscripcion.model.js
import mongoose from "mongoose";

const suscripcionSchema = new mongoose.Schema(
  {
    empresa: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
    },
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
      index: true,
    },

    activa: {
      type: Boolean,
      default: true,
      index: true,
    },

    fechaInicio: {
      type: Date,
      default: Date.now,
    },

    fechaFin: {
      type: Date,
      required: true,
    },

    // 🔥 NUEVO: Servicios totales del plan (2 por defecto)
    serviciosTotales: {
      type: Number,
      default: 2,
    },

    // 🔥 NUEVO: Servicios que ya utilizó
    serviciosUsados: {
      type: Number,
      default: 0,
    },

    historial: {
      type: Boolean,
      default: false,
    },
    tipoPlan: {
      type: String,
      // "plan_personalizado" 🔥 NUEVO: se agrega sin tocar los valores viejos,
      // que siguen funcionando exactamente igual para las suscripciones ya
      // creadas. De ahora en adelante toda suscripción nueva se crea con
      // este tipo, a partir de un PlanSuscripcion elegido por el negocio
      // (ver planId/plan más abajo), en vez de un tipo fijo escrito en el código.
      enum: [
        "creditos",
        "combo_visita_corte_barba",
        "padre_e_hijo",
        "barba",
        "plan_personalizado",
      ],
      default: "creditos",
    },

    // 🔥 NUEVO — solo se llena cuando tipoPlan === "plan_personalizado".
    // Referencia informativa al plan usado (puede haber sido editado o
    // borrado después, por eso también se guarda un "snapshot" abajo).
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PlanSuscripcion",
      default: null,
    },

    // 🔥 NUEVO — foto de los datos del plan al momento de suscribir al
    // cliente, para que editar o borrar el plan después no afecte a las
    // suscripciones que ya se activaron con él.
    planSnapshot: {
      nombre: String,
      precio: Number,
      duracionDias: Number,
      cicloDias: Number,
      cantidadPorCiclo: Number,
      serviciosPermitidos: [
        { type: mongoose.Schema.Types.ObjectId, ref: "Servicio" },
      ],
      diasVisibilidadCalendario: Number,
    },
  },
  {
    timestamps: true,
  },
);

// ✅ Índice compuesto normal (NO único)
suscripcionSchema.index({ usuario: 1, empresa: 1, activa: 1 });


export default mongoose.model("Suscripcion", suscripcionSchema);
