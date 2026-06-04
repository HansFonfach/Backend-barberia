import { Schema, model } from "mongoose";

const { ObjectId } = Schema.Types;

const VentaDirectaSchema = new Schema(
  {
    empresa: { type: ObjectId, ref: "Empresa", required: true },

    vendedor: { type: ObjectId, ref: "Usuario", required: true },

    productos: [
      {
        producto: { type: ObjectId, ref: "Producto" },
        nombre: String,
        precio: Number,
        categoria: String,
        cantidad: { type: Number, default: 1 },
        subtotal: Number,
      },
    ],

    totalFinal: { type: Number, default: 0 },

    metodoPago: {
      type: String,
      enum: ["efectivo", "transferencia", "debito", "credito", "otro"],
      default: "efectivo",
    },

    observacion: { type: String, trim: true, default: "" },

    anulada: { type: Boolean, default: false },
    anuladaEn: { type: Date, default: null },
    motivoAnulacion: { type: String, default: "" },

    fecha: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

VentaDirectaSchema.index({ empresa: 1, fecha: -1 });
VentaDirectaSchema.index({ vendedor: 1, fecha: -1 });

export default model("VentaDirecta", VentaDirectaSchema);