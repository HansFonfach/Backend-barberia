import mongoose from "mongoose";

const { Schema } = mongoose;

// Rutina de entrenamiento (ej: "Rutina de pecho"): una lista de
// ejercicios/máquinas con series/reps/peso sugeridos, que el cliente arma
// una vez y reutiliza cada vez que le toca ese grupo — no reemplaza al
// registro diario (RegistroEntrenamiento), es la "receta" que uno sigue.
//
// compartida=true la hace visible para el resto de la empresa (dueño +
// amigos invitados) en "Rutinas compartidas", con su nombre de autor.
// compartidaConUsuarios es aparte: compartir con 1+ personas puntuales de
// la empresa (sin hacerla pública para todos). Ambas son independientes y
// se pueden combinar. En los dos casos es SOLO LECTURA para quien la ve —
// si le sirve, la usa como base para crear su propia rutina editable (no
// hay edición conjunta, para no pisarse cambios ni tener dueños ambiguos).
const RutinaSchema = new Schema(
  {
    empresa: {
      type: Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
      index: true,
    },
    cliente: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
      index: true,
    },

    nombre: { type: String, required: true, trim: true, maxlength: 80 },

    // Mismo set de valores que tipoActividad en RegistroEntrenamiento,
    // para que "hoy te toca X" pueda more adelante sugerir la rutina que
    // corresponde a ese grupo.
    grupoMuscular: {
      type: String,
      required: true,
      enum: [
        "pecho",
        "espalda",
        "piernas",
        "hombros",
        "brazos",
        "core",
        "cardio",
        "otro",
      ],
    },

    ejercicios: [
      {
        _id: false,
        nombre: { type: String, required: true, trim: true, maxlength: 80 },
        series: { type: Number, default: null, min: 0, max: 20 },
        repeticiones: { type: Number, default: null, min: 0, max: 100 },
        pesoKg: { type: Number, default: null, min: 0, max: 500 },
      },
    ],

    notas: { type: String, default: "", maxlength: 300 },

    compartida: { type: Boolean, default: false },

    compartidaConUsuarios: [
      { type: Schema.Types.ObjectId, ref: "Usuario" },
    ],
  },
  { timestamps: true },
);

RutinaSchema.index({ empresa: 1, cliente: 1 });
RutinaSchema.index({ empresa: 1, compartida: 1 });
RutinaSchema.index({ empresa: 1, compartidaConUsuarios: 1 });

export default mongoose.model("Rutina", RutinaSchema);
