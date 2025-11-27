import mongoose from "mongoose";


const ExcepcionHorarioSchema = new mongoose.Schema({
  barbero: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  fecha: { type: Date, required: true },
  horaInicio: { type: String, required: true },
  horaFin: { type: String }, // Opcional, no required
  motivo: { type: String },
  tipo: { type: String, enum: ["bloqueo", "extra"], required: true },
}, { timestamps: true });

export default mongoose.model("ExcepcionHorario", ExcepcionHorarioSchema);