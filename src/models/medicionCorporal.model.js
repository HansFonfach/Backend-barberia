import mongoose from "mongoose";

const { Schema } = mongoose;

// Bitácora de peso/medidas corporales de un cliente de gimnasio.
//
// IMPORTANTE: este modelo es puramente descriptivo. El sistema nunca
// interpreta estos datos (no da consejos de nutrición, no dice si un
// número es "bueno" o "malo", no calcula IMC ni nada por el estilo) —
// solo guarda lo que la persona anotó (el propio cliente, o el profe en
// un control presencial con huincha/balanza) y lo grafica en el tiempo.
// Cualquier interpretación queda 100% a criterio del cliente o de un
// profesional de la salud fuera de la app.
//
// Pensado para empresas con modulos.clasesGrupales = true (rubro gimnasio).
const MedicionCorporalSchema = new Schema(
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

    pesoKg: { type: Number, default: null, min: 0, max: 500 },
    alturaCm: { type: Number, default: null, min: 0, max: 300 },
    grasaCorporalPorcentaje: { type: Number, default: null, min: 0, max: 100 },

    medidas: {
      cinturaCm: { type: Number, default: null, min: 0, max: 300 },
      caderaCm: { type: Number, default: null, min: 0, max: 300 },
      pechoCm: { type: Number, default: null, min: 0, max: 300 },
      brazoCm: { type: Number, default: null, min: 0, max: 300 },
      piernaCm: { type: Number, default: null, min: 0, max: 300 },
    },

    notas: { type: String, default: "", maxlength: 500 },

    // Quién ingresó este registro: el propio cliente, o el admin/profe
    // durante un control presencial. No se permite borrar un registro
    // hecho por el admin desde la cuenta del cliente (y viceversa).
    registradoPor: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
    },
    registradoPorRol: {
      type: String,
      enum: ["cliente", "admin"],
      required: true,
    },
  },
  { timestamps: true },
);

MedicionCorporalSchema.index({ empresa: 1, cliente: 1, fecha: -1 });

export default mongoose.model("MedicionCorporal", MedicionCorporalSchema);
