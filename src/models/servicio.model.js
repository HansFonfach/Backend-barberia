import mongoose from "mongoose";

const { Schema } = mongoose;

const servicioSchema = new Schema({
  nombre: { type: String, required: true },
  precio: { type: Number, required: true },
  duracion: { type: Number, default: 60, required: true },
  descripcion: { type: String, required: true },
});

export default mongoose.model("Servicio", servicioSchema);
