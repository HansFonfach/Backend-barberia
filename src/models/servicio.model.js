import mongoose from "mongoose";

const { Schema } = mongoose;

const servicioSchema = new Schema({
  empresa: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Empresa",
    required: true,
  },

  categoria: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Categoria", // 👈 ya estaba bien, ahora coincide con el modelo renombrado
  },

  icono: {
    type: String,
    default: null,
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
  cuidados: { type: String, default: null },

  diasRecomendadosRepeticion: {
    type: Number,
    default: null,
  },

  recordatorioActivo: {
    type: Boolean,
    default: true,
  },
});

export default mongoose.model("Servicio", servicioSchema);