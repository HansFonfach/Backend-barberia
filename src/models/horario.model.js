import mongoose from "mongoose";

const horarioSchema = new mongoose.Schema(
  {
    barbero: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    diaSemana: {
      type: Number, // 0 (domingo) → 6 (sábado)
      required: true,
    },
    horaInicio: { type: String, required: true }, // "09:00"
    horaFin: { type: String, required: true }, // "19:00"

    colacionInicio: { type: String },
    colacionFin: { type: String },

    duracionBloque: {
      type: Number,
      required: true,
      default: 60, // 👈 MUY IMPORTANTE
    },
    horasAncla: [
      {
        hora: { type: String, required: true },
        serviciosPermitidos: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Servicio",
          },
        ], 
      },
    ],
  },
  { timestamps: true },
);

horarioSchema.index({ barbero: 1, diaSemana: 1 }, { unique: true });

export default mongoose.model("Horario", horarioSchema);
