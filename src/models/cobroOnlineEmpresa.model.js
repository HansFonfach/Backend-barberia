import mongoose from "mongoose";

// Cobros online de la mensualidad de AgendaFonfach (Mercado Pago).
// Un documento por intento de pago único (orden de Checkout Pro) o por cada
// cobro mensual de una suscripción. Sirve para no aplicar dos veces el mismo
// pago (el webhook y la vuelta del cliente pueden llegar los dos).
const CobroOnlineEmpresaSchema = new mongoose.Schema(
  {
    empresa: { type: mongoose.Schema.Types.ObjectId, ref: "Empresa", required: true, index: true },
    tipo: { type: String, enum: ["pago_unico", "automatico"], required: true },
    proveedor: { type: String, default: "mercadopago" },
    ordenId: { type: String },
    pagoAutorizadoId: { type: String },
    suscripcionId: { type: String },
    monto: { type: Number, required: true },
    estado: {
      type: String,
      enum: ["pendiente", "pagado", "rechazado", "error"],
      default: "pendiente",
    },
    aplicadoEn: { type: Date, default: null },
    detalle: { type: String, default: "" },
  },
  { timestamps: true },
);

CobroOnlineEmpresaSchema.index({ ordenId: 1 }, { unique: true, partialFilterExpression: { ordenId: { $type: "string" } } });
CobroOnlineEmpresaSchema.index(
  { pagoAutorizadoId: 1 },
  { unique: true, partialFilterExpression: { pagoAutorizadoId: { $type: "string" } } },
);

export default mongoose.model("CobroOnlineEmpresa", CobroOnlineEmpresaSchema, "cobrosOnlineEmpresa");
