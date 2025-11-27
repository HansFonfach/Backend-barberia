import mongoose from "mongoose";
const { Schema } = mongoose;

const HorarioSchema = new Schema({
  barbero: { type: Schema.Types.ObjectId, ref: "Usuario", required: true },
  dia: {
    type: Number, // 0 = domingo, 1 = lunes ... 6 = sábado
    required: true,
    min: 0,
    max: 6,
  },
  bloques: [
    {
      horaInicio: { type: String, required: true }, // "08:00"
      horaFin: { type: String, required: true },    // "14:00"
    },
  ],
}, { timestamps: true });

export default mongoose.model("Horario", HorarioSchema);
