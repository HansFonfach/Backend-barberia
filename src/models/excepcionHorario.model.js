import mongoose from "mongoose";

const { Schema } = mongoose;

const ExcepcionHorarioSchema = new Schema(
  {
    barbero: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
      index: true,
    },

    tipo: {
      type: String,
      enum: ["bloqueo_hora", "hora_extra", "bloqueo_dia", "vacaciones"],
      required: true,
      index: true,
    },

    // Para bloqueos individuales o horas extra
    fecha: {
      type: Date,
      index: true,
    },

    // Para vacaciones (rango)
    fechaInicio: Date,
    fechaFin: Date,

    horaInicio: String,
    horaFin: String,

    motivo: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

// índice para buscar vacaciones rápido
ExcepcionHorarioSchema.index({
  barbero: 1,
  tipo: 1,
  fechaInicio: 1,
  fechaFin: 1,
});

// índice para bloqueos por día
ExcepcionHorarioSchema.index({
  barbero: 1,
  tipo: 1,
  fecha: 1,
});

export default mongoose.model("ExcepcionHorario", ExcepcionHorarioSchema);