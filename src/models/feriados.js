import mongoose from "mongoose";

const FeriadoSchema = new mongoose.Schema({
  fecha: {
    type: Date,
    required: true,
    unique: true
  },
  nombre: {
    type: String,
    required: true
  },
  activo: {
    type: Boolean,
    default: true // true = bloquear reservas
  }
}, { timestamps: true });

export default mongoose.model("Feriado", FeriadoSchema);