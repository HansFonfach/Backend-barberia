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
});

export default mongoose.model("Servicio", servicioSchema);
