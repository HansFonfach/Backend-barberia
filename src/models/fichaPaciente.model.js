import mongoose from "mongoose";

const { Schema } = mongoose;

const FichaPacienteSchema = new Schema(
  {
    empresa: {
      type: Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
    },
    paciente: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
    },
    profesional: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
    },

    // ====== DATOS PERSONALES CLÍNICOS ======
    fechaNacimiento: { type: Date },
    sexo: { type: String, enum: ["masculino", "femenino", "otro"] },
    ocupacion: { type: String },
    prevision: {
      type: String,
      enum: ["fonasa", "isapre", "particular", "otro"],
    },

    // ====== ANAMNESIS ======
    motivoConsulta: { type: String },
    antecedentesPatologicos: [{ type: String }], // ["diabetes", "hipertensión"]
    antecedentesFamiliares: [{ type: String }],
    medicamentos: [{ type: String }],
    alergias: [{ type: String }],
    cirugiasPrevias: [{ type: String }],

    // ====== HÁBITOS ======
    habitos: {
      nivelActividad: {
        type: String,
        enum: ["sedentario", "leve", "moderado", "intenso", "muy_intenso"],
      },
      actividadFisica: { type: String }, // "corre 3 veces/semana"
      horasSueno: { type: Number },
      fumador: { type: Boolean, default: false },
      consumoAlcohol: {
        type: String,
        enum: ["nunca", "ocasional", "frecuente"],
      },
      consumoAgua: { type: Number }, // litros/día estimados
    },

    // ====== OBJETIVOS ======
    objetivos: {
      principal: { type: String }, // "bajar de peso", "ganar masa muscular"
      pesoObjetivo: { type: Number }, // kg
      plazoMeses: { type: Number }, // tiempo estimado para el objetivo
    },

    // ====== ESTADO ======
    estado: {
      type: String,
      enum: ["activo", "inactivo", "alta"],
      default: "activo",
    },

    notas: { type: String }, // notas internas del profesional
    deletedAt: { type: Date, default: null },
  },

  { timestamps: true },
);

// Una ficha por paciente por empresa
FichaPacienteSchema.index({ empresa: 1, paciente: 1 }, { unique: true });
FichaPacienteSchema.index({ empresa: 1, profesional: 1 });
FichaPacienteSchema.index({ empresa: 1, estado: 1 });

export default mongoose.model("FichaPaciente", FichaPacienteSchema);
