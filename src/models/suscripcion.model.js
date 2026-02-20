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
  },
  {
    timestamps: true,
  },
);

// ✅ Índice compuesto normal (NO único)
suscripcionSchema.index({ usuario: 1, empresa: 1, activa: 1 });

// ❌ NO uses índice único parcial - eso causa el problema
// suscripcionSchema.index(
//   { usuario: 1 },
//   { unique: true, partialFilterExpression: { activa: true } }
// );

export default mongoose.model("Suscripcion", suscripcionSchema);
