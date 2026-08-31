import mongoose from "mongoose";

const { Schema } = mongoose;

// Consumo de agua del diario alimenticio (modulos.entrenamientoPersonal):
// cada "toque" (ej: "+250ml") queda como su propio registro — el total
// del día se calcula sumándolos (ver getAguaHoy en
// diarioAlimenticioController.js), no se guarda un acumulado aparte, para
// no tener dos fuentes de verdad desincronizadas.
const RegistroAguaSchema = new Schema(
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
    mililitros: { type: Number, required: true, min: 1, max: 5000 },
  },
  { timestamps: true },
);

RegistroAguaSchema.index({ empresa: 1, cliente: 1, fecha: -1 });

export default mongoose.model("RegistroAgua", RegistroAguaSchema);
