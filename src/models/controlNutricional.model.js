import mongoose from "mongoose";

const { Schema } = mongoose;

const ControlNutricionalSchema = new Schema(
  {
    empresa: {
      type: Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
    },
    ficha: {
      type: Schema.Types.ObjectId,
      ref: "FichaPaciente",
      required: true,
    },
    reserva: {
      type: Schema.Types.ObjectId,
      ref: "Reserva",
      default: null, // puede existir un control sin reserva (ingresado manualmente)
    },
    profesional: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
    },

    fecha: { type: Date, required: true },
    numeroControl: { type: Number, required: true }, // 1°, 2°, 3°...
    tipoControl: {
      type: String,
      enum: ["primera_vez", "control", "urgencia", "teleconsulta"],
      default: "control",
    },

    // ====== ANTROPOMETRÍA ======
    antropometria: {
      peso: { type: Number },             // kg
      talla: { type: Number },            // cm
      imc: { type: Number },              // calculado automáticamente
      circunferenciaCintura: { type: Number }, // cm
      circunferenciaCadera: { type: Number },  // cm
      indiceCinturaCaldera: { type: Number },  // calculado
      masaGrasa: { type: Number },        // %
      masaMuscular: { type: Number },     // kg
      aguaCorporal: { type: Number },     // %
      masaOsea: { type: Number },         // kg
      metabolismoBasal: { type: Number }, // kcal
      edadMetabolica: { type: Number },   // años
      metodoMedicion: {
        type: String,
        enum: ["báscula", "bioimpedancia", "pliegues", "otro"],
        default: "báscula",
      },
    },

    // ====== EVALUACIÓN DIETÉTICA ======
    evaluacionDietetica: {
      caloriasEstimadas: { type: Number },     // kcal/día actuales
      caloriasObjetivo: { type: Number },      // kcal/día recomendadas
      distribucionMacros: {
        carbohidratos: { type: Number },       // %
        proteinas: { type: Number },           // %
        grasas: { type: Number },              // %
      },
      hidratacion: {
        type: String,
        enum: ["adecuada", "insuficiente", "excesiva"],
      },
      frecuenciaComidas: { type: Number },     // veces/día
      recordatorio24h: { type: String },       // texto libre: qué comió ayer
    },

    // ====== EXÁMENES DE LABORATORIO ======
    examenes: [
      {
        nombre: { type: String },              // "glucosa", "colesterol total"
        valor: { type: String },               // string para admitir "<5", ">200"
        unidad: { type: String },              // "mg/dL", "mmol/L"
        valorReferencia: { type: String },     // "70-100"
        estado: {
          type: String,
          enum: ["normal", "alto", "bajo", "critico"],
        },
        fecha: { type: Date },
      },
    ],

    // ====== PLAN ======
    plan: {
      descripcion: { type: String },           // texto libre o resumen
      archivoUrl: { type: String },            // PDF del plan alimentario
      archivoPublicId: { type: String },       // para Cloudinary
      vigenciaDesde: { type: Date },
      vigenciaHasta: { type: Date },
    },

    // ====== EVOLUCIÓN ======
    evolucion: {
      adherenciaPlanAnterior: {
        type: String,
        enum: ["excelente", "buena", "regular", "mala", "sin_plan_previo"],
        default: "sin_plan_previo",
      },
      dificultadesReportadas: { type: String },
      logrosReportados: { type: String },
    },

    // ====== CIERRE ======
    recomendaciones: { type: String },
    proximoControl: { type: Date },
    notas: { type: String },                   // notas privadas del profesional

    estado: {
      type: String,
      enum: ["borrador", "completado"],
      default: "borrador",                     // borrador mientras lo está llenando
    },
  },

  { timestamps: true },
);

ControlNutricionalSchema.index({ ficha: 1, fecha: -1 });
ControlNutricionalSchema.index({ empresa: 1, profesional: 1, fecha: -1 });
ControlNutricionalSchema.index({ reserva: 1 }, { sparse: true });

// Evita duplicar el número de control por ficha
ControlNutricionalSchema.index(
  { ficha: 1, numeroControl: 1 },
  { unique: true }
);

export default mongoose.model("ControlNutricional", ControlNutricionalSchema);