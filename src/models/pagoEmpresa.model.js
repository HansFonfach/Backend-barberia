import mongoose from "mongoose";

const PagoEmpresaSchema = new mongoose.Schema({
  empresa: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Empresa",
    required: true,
  },

  mes: Number,
  anio: Number,

  monto: Number,

  estado: {
    type: String,
    enum: [
      "pendiente",
      "pagado",
      "atrasado",
      "cancelado",
    ],
    default: "pendiente",
  },

  fechaVencimiento: Date,

  fechaPago: Date,

  metodoPago: {
    type: String,
    enum: ["transferencia"],
    default: "transferencia",
  },

  comprobante: String,

  observacion: String,

  validadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Usuario",
  },
}, {
  timestamps: true,
});

export default mongoose.model(
  "PagoEmpresa",
  PagoEmpresaSchema
);