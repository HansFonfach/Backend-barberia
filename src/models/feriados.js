// models/feriados.js
import mongoose from "mongoose";

const FeriadoSchema = new mongoose.Schema(
  {
    fecha: {
      type: Date,
      required: true,
      unique: true,
    },
    nombre: {
      type: String,
      required: true,
    },
    activo: {
      type: Boolean,
      default: true,
    },
    // NUEVO: comportamiento del feriado
    comportamiento: {
      type: String,
      enum: ["bloquear_todo", "permitir_excepciones"],
      default: "permitir_excepciones", // ← IMPORTANTE: Por defecto permite excepciones
    },
  },
  { timestamps: true }
);

export default mongoose.model("Feriado", FeriadoSchema);