import mongoose from "mongoose";

const CanjeSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
    },
    descripcion: {
      type: String,
      required: true,
      trim: true,
    },
    puntos: {
      type: Number,
      required: true,
      min: 0,
    },
    imagen: {
      type: String,
    },
    categoria: {
      type: String,
      enum: ["descuento", "producto", "servicio",  "otro"],
      default: "otro",
    },
    stock: {
      type: Number,
      default: 0,
    },
    activo: {
      type: Boolean,
      default: true,
    },
    // fechaInicio: {
    //   type: Date,
    // },
    // fechaFin: {
    //   type: Date,
    // },
    maxPorUsuario: {
      type: Number,
      default: 1,
    },
    condiciones: {
      type: String,
    },
    canjesRealizados: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Canje", CanjeSchema);
