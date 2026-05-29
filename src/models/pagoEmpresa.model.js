import mongoose from "mongoose";

const PagoEmpresaSchema = new mongoose.Schema(
  {
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
      enum: ["pendiente", "pagado", "atrasado", "cancelado"],
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

    notificaciones: {
      diasAntes5: { type: Boolean, default: false },
      diasAntes2: { type: Boolean, default: false },
      diasAntes1: { type: Boolean, default: false },
      diaVencimiento: { type: Boolean, default: false },
      diasDespues3: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);
export default mongoose.model("PagoEmpresa", PagoEmpresaSchema, "pagoEmpresas");
