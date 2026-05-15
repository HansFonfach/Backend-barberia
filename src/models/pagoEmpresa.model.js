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
      diasAntes5: { type: Boolean, default: false }, // 5 días antes
      diasAntes2: { type: Boolean, default: false }, // 2 días antes
      diaVencimiento: { type: Boolean, default: false }, // el mismo día
      diasDespues3: { type: Boolean, default: false }, // suspensión a los 3 días
    },
  },
  { timestamps: true },
);
export default mongoose.model("PagoEmpresa", PagoEmpresaSchema, "pagoEmpresas");
