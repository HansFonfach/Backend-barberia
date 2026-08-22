import mongoose from "mongoose";

const { Schema } = mongoose;

// Bloque de horario semanal recurrente de una clase (ej. lunes 19:00)
const HorarioClaseSchema = new Schema(
  {
    diaSemana: { type: Number, required: true, min: 0, max: 6 }, // 0=domingo ... 6=sábado
    horaInicio: { type: String, required: true }, // "HH:mm"
  },
  { _id: false },
);

// Clase grupal con cupo (ej. Crossfit, Yoga, Spinning).
// Pensado para empresas con modulos.clasesGrupales = true (rubro gimnasio/box);
// no interfiere con Servicio/Reserva que usan barberías y salones.
const ClaseSchema = new Schema(
  {
    empresa: {
      type: Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
      index: true,
    },

    nombre: { type: String, required: true },
    descripcion: { type: String, default: "" },

    instructor: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      default: null,
    },

    duracion: {
      type: Number, // minutos
      required: true,
      min: 5,
      max: 300,
    },

    cupoMaximo: {
      type: Number,
      required: true,
      min: 1,
    },

    color: { type: String, default: null },

    // Precio de la clase suelta ("pase del día") para quien no tiene
    // mensualidad activa. null = todavía no se ha definido un precio.
    precioPaseDiario: { type: Number, default: null, min: 0 },

    horarioSemanal: {
      type: [HorarioClaseSchema],
      default: [],
    },

    // Rango de vigencia opcional (null = sin fecha de término)
    vigenciaDesde: { type: Date, default: null },
    vigenciaHasta: { type: Date, default: null },

    activa: { type: Boolean, default: true },
  },
  { timestamps: true },
);

ClaseSchema.index({ empresa: 1, activa: 1 });

export default mongoose.model("Clase", ClaseSchema);
