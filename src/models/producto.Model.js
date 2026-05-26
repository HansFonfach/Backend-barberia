import mongoose from "mongoose";

const ProductoSchema = new mongoose.Schema(
  {
    empresa: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
    },
    nombre: { type: String, required: true, trim: true },
    precio: { type: Number, required: true, min: 0 },
    descripcion: { type: String, trim: true },
    imagen: { type: String },
    stock: { type: Number, default: null }, // null = sin control de stock
    activo: { type: Boolean, default: true },
    categoria: { type: String, trim: true }, // ej: "hidratación", "color", etc.
  },
  { timestamps: true },
);

export default mongoose.model("Producto", ProductoSchema);
