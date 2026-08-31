import mongoose from "mongoose";

const { Schema } = mongoose;

// Comida registrada en el diario alimenticio (modulos.entrenamientoPersonal):
// bitácora personal, no una calculadora de calorías — pensada sobre todo
// para que quede un registro ordenado por fecha que sirva para mostrarle
// a un nutricionista en un control. La foto es opcional, sube a Cloudinary
// igual que el logo de la empresa o la foto de perfil (ver
// diarioAlimenticioController.js).
const ComidaRegistradaSchema = new Schema(
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

    tipoComida: {
      type: String,
      required: true,
      enum: ["desayuno", "almuerzo", "once", "cena", "colacion", "otro"],
    },

    descripcion: { type: String, default: "", maxlength: 300 },

    fotoUrl: { type: String, default: null },
    fotoPublicId: { type: String, default: null }, // para poder borrarla de Cloudinary
  },
  { timestamps: true },
);

ComidaRegistradaSchema.index({ empresa: 1, cliente: 1, fecha: -1 });

export default mongoose.model("ComidaRegistrada", ComidaRegistradaSchema);
