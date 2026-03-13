import mongoose from "mongoose";

const { Schema } = mongoose;

const servicioSchema = new Schema({
  empresa: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Empresa",
    required: true,
  },

  nombre: { type: String, required: true },

  descripcion: { type: String },

  precio: {
    type: Number,
    required: true,
  },

  activo: {
    type: Boolean,
    default: true,
  },
  instrucciones: { type: String, default: null },

  // 🔹 cada cuantos días se recomienda repetir el servicio
  diasRecomendadosRepeticion: {
    type: Number,
    default: null, // null = el sistema calcula el promedio del cliente
  },

  // 🔹 activar o desactivar recordatorios para este servicio
  recordatorioActivo: {
    type: Boolean,
    default: true,
  },
});

export default mongoose.model("Servicio", servicioSchema);
