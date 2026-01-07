import mongoose from "mongoose";

const { Schema } = mongoose;

// barberoServicio.model.js - VERSIÓN MEJORADA
const barberoServicioSchema = new Schema(
  {
    barbero: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
    },
    servicio: {
      type: Schema.Types.ObjectId,
      ref: "Servicio",
      required: true,
    },
    duracion: {
      type: Number, // minutos - ej: 45, 30, 90, 15
      required: true,
      min: 15, // mínimo 15 minutos
      max: 240, // máximo 4 horas
    },
   
    intervaloMinimo: {
      type: Number,
      default: 15, // ← NUEVO CAMPO! Intervalo mínimo de reserva
      min: 5, // mínimo 5 minutos
      max: 60, // máximo 1 hora
    },
    activo: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

barberoServicioSchema.index({ barbero: 1, servicio: 1 }, { unique: true });

export default mongoose.model("BarberoServicio", barberoServicioSchema);
