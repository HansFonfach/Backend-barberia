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
      enum: [
        "bloqueo_hora",
        "bloqueo",
        "hora_extra",
        "bloqueo_dia",
        "vacaciones",
        "extra",
        "trabajo_feriado",
      ],
      required: true,
      index: true,
    },

    // Para bloqueos individuales o horas extra
    fecha: {
      type: Date,
      index: true,
    },

    serviciosPermitidos: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Servicio",
      },
    ],

    // Precio distinto al normal del servicio, solo para esta excepción
    // (feriado u hora extra) — opcional. Si un servicio no aparece acá,
    // se usa su precio normal (con su descuento vigente si corresponde),
    // exactamente igual que hoy. No reemplaza el descuento por
    // porcentaje del servicio: ese es "cóbrame menos para atraer
    // clientes", esto es "cóbrame más porque este horario vale más" —
    // son cosas distintas a propósito.
    preciosEspeciales: {
      type: [
        {
          servicio: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Servicio",
            required: true,
          },
          precio: { type: Number, required: true, min: 0 },
        },
      ],
      default: [],
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
