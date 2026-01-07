import mongoose from "mongoose";

const { Schema } = mongoose;

const servicioSchema = new Schema({
  nombre: { type: String, required: true },
  descripcion: { type: String },
  precio: {
    type: Number,
    required: true,
  },
});

export default mongoose.model("Servicio", servicioSchema);
