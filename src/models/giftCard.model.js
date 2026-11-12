import mongoose from "mongoose";

const { Schema } = mongoose;

// Giftcard de un negocio: un servicio o un monto que alguien le regala a otra
// persona. Se pide desde la página del negocio (transferencia + comprobante)
// y el admin la aprueba; o la crea el admin directo cuando la venden en el
// local. El código se genera recién al aprobarla.
//
// Lo usado NO se guarda acá: se calcula desde las reservas que la usaron
// (reserva.giftcard.giftcardId), igual que los códigos de descuento. Así, si
// una reserva se cancela, la giftcard vuelve a quedar disponible sola.
const GiftCardSchema = new Schema(
  {
    empresa: { type: Schema.Types.ObjectId, ref: "Empresa", required: true, index: true },

    // GC-XXXX-XXXX. null mientras está pendiente.
    codigo: { type: String, default: null },

    tipo: { type: String, enum: ["servicio", "monto"], required: true },
    servicio: { type: Schema.Types.ObjectId, ref: "Servicio", default: null },
    servicioNombre: { type: String, default: "" },
    // Valor de la giftcard: precio del servicio al comprarla, o el monto elegido
    monto: { type: Number, required: true, min: 0 },

    // usada / vencida se calculan (ver utils/giftcards.js)
    estado: {
      type: String,
      enum: ["pendiente", "activa", "rechazada", "anulada"],
      default: "pendiente",
    },

    comprador: {
      nombre: { type: String, trim: true, default: "" },
      email: { type: String, trim: true, lowercase: true, default: "" },
      telefono: { type: String, trim: true, default: "" },
    },
    destinatario: {
      nombre: { type: String, trim: true, default: "" },
      email: { type: String, trim: true, lowercase: true, default: "" },
    },
    de: { type: String, trim: true, maxlength: 80, default: "" },
    mensaje: { type: String, trim: true, maxlength: 300, default: "" },

    pago: {
      metodo: { type: String, enum: ["transferencia", "efectivo", "otro"], default: "transferencia" },
      comprobante: {
        url: { type: String, default: "" },
        publicId: { type: String, default: "" },
      },
    },

    origen: { type: String, enum: ["web", "panel"], default: "web" },

    venceEn: { type: Date, default: null },
    aprobadaEn: { type: Date, default: null },
    aprobadaPor: { type: Schema.Types.ObjectId, ref: "Usuario", default: null },
    rechazo: {
      motivo: { type: String, default: "" },
      fecha: { type: Date, default: null },
      por: { type: Schema.Types.ObjectId, ref: "Usuario", default: null },
    },
    anuladaEn: { type: Date, default: null },
    anuladaPor: { type: Schema.Types.ObjectId, ref: "Usuario", default: null },
    correoEnviadoEn: { type: Date, default: null },
  },
  { timestamps: true },
);

GiftCardSchema.index(
  { empresa: 1, codigo: 1 },
  { unique: true, partialFilterExpression: { codigo: { $type: "string" } } },
);
GiftCardSchema.index({ empresa: 1, estado: 1, createdAt: -1 });

export default mongoose.model("GiftCard", GiftCardSchema, "giftcards");
