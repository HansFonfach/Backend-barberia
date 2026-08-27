import mongoose from "mongoose";

const { Schema } = mongoose;

// Registro libre de entrenamiento (gimnasio o deporte) — no depende de un
// horario ni de "clases" con cupo, a diferencia del modelo Clase/
// InscripcionClase que usan los gimnasios reales. Pensado para
// modulos.entrenamientoPersonal = true: un uso más personal/informal,
// donde cada quien anota qué hizo ese día cuando quiere, sin agendar nada
// con anticipación.
const RegistroEntrenamientoSchema = new Schema(
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

    fecha: { type: Date, required: true, default: Date.now },

    // Grupos musculares (para la sugerencia de rotación) + cardio/fútbol/
    // otro deporte (cuentan para la racha y el aviso de descanso, pero no
    // entran en la rotación de grupos musculares).
    tipoActividad: {
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
        "futbol",
        "otro",
      ],
    },

    duracionMinutos: { type: Number, default: null, min: 0, max: 600 },
    notas: { type: String, default: "", maxlength: 300 },

    // Detalle opcional por máquina/ejercicio (ej: "Prensa de piernas",
    // 30kg, 3 series de 12) — permite sugerir subir peso más adelante
    // (ver calcularProgresoEntrenamiento). Nada de esto es obligatorio:
    // quien solo quiere marcar "hice piernas" sin detalle puede seguir
    // haciéndolo igual que antes.
    ejercicios: [
      {
        _id: false,
        nombre: { type: String, required: true, trim: true, maxlength: 80 },
        pesoKg: { type: Number, default: null, min: 0, max: 500 },
        series: { type: Number, default: null, min: 0, max: 20 },
        repeticiones: { type: Number, default: null, min: 0, max: 100 },
      },
    ],
  },
  { timestamps: true },
);

RegistroEntrenamientoSchema.index({ empresa: 1, cliente: 1, fecha: -1 });

export default mongoose.model("RegistroEntrenamiento", RegistroEntrenamientoSchema);
