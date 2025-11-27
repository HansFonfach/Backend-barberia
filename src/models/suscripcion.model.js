// models/suscripcion.model.js
import mongoose from "mongoose";

const suscripcionSchema = new mongoose.Schema({
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Usuario",
    required: true,
    index: true
  },
  activa: {
    type: Boolean,
    default: true,
    index: true
  },
  fechaInicio: {
    type: Date,
    default: Date.now,
  },
  fechaFin: {
    type: Date,
    required: true,
  },
  historial: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// ✅ Índice compuesto normal (NO único)
suscripcionSchema.index({ usuario: 1, activa: 1 });

// ❌ NO uses índice único parcial - eso causa el problema
// suscripcionSchema.index(
//   { usuario: 1 },
//   { unique: true, partialFilterExpression: { activa: true } }
// );

export default mongoose.model("Suscripcion", suscripcionSchema);