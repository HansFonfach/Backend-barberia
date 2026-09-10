// models/feriadoEmpresa.model.js
//
// Decisión de UNA empresa sobre UN feriado puntual: ¿lo trabaja o no?
//
// Por qué existe este modelo aparte de Feriado: el catálogo de feriados
// (models/feriados.js) es compartido por toda la plataforma — fechas y
// nombres de feriados nacionales, que es información pública y correcta
// que siga siendo global. Pero "¿esta empresa atiende este feriado?" es
// una decisión de CADA negocio, y antes de este modelo esa decisión vivía
// en un campo (`comportamiento`) dentro del propio catálogo compartido —
// es decir, si una empresa la cambiaba, la cambiaba para TODAS las
// empresas de la plataforma. Este modelo separa esa decisión y la deja
// scopeada por empresa, sin tocar el catálogo compartido.
//
// Que NO exista un documento para (empresa, feriado) significa "la
// empresa no se ha pronunciado" — getHorasDisponibles lo trata como
// cerrado por defecto (mismo comportamiento seguro que tenía el sistema
// antes de este cambio para prácticamente todas las empresas).
import mongoose from "mongoose";

const { Schema } = mongoose;

const FeriadoEmpresaSchema = new Schema(
  {
    empresa: {
      type: Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
      index: true,
    },
    feriado: {
      type: Schema.Types.ObjectId,
      ref: "Feriado",
      required: true,
      index: true,
    },
    // Denormalizado desde Feriado.fecha para poder consultar por rango de
    // fecha sin un $lookup — el mismo criterio que ya usa el resto del
    // archivo (fecha guardada en UTC, se interpreta en America/Santiago).
    fecha: {
      type: Date,
      required: true,
    },
    habilitado: {
      type: Boolean,
      default: true,
    },
    creadoPor: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      default: null,
    },
  },
  { timestamps: true },
);

// Una sola decisión por empresa+feriado — togglear vuelve a escribir el
// mismo documento, no crea uno nuevo cada vez.
FeriadoEmpresaSchema.index({ empresa: 1, feriado: 1 }, { unique: true });
FeriadoEmpresaSchema.index({ empresa: 1, fecha: 1 });

export default mongoose.model("FeriadoEmpresa", FeriadoEmpresaSchema);
