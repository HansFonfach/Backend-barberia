import mongoose from "mongoose";

const { Schema } = mongoose;

// Inscripción de un cliente a una sesión puntual de una Clase.
const InscripcionClaseSchema = new Schema(
  {
    empresa: {
      type: Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
      index: true,
    },

    clase: {
      type: Schema.Types.ObjectId,
      ref: "Clase",
      required: true,
      index: true,
    },

    cliente: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
      index: true,
    },

    // Fecha y hora exacta de la sesión a la que se inscribió
    fecha: { type: Date, required: true, index: true },

    estado: {
      type: String,
      enum: ["confirmada", "cancelada", "no_asistio", "completada"],
      default: "confirmada",
    },

    // Cómo accedió a esta sesión (a confirmar reglas exactas de negocio con el cliente del gym)
    tipoAcceso: {
      type: String,
      enum: ["membresia", "pase_dia", "prueba_gratis"],
      required: true,
    },

    pago: {
      estado: {
        type: String,
        enum: ["no_aplica", "pendiente", "pagado"],
        default: "no_aplica",
      },
      monto: { type: Number, default: 0 },
      metodo: {
        type: String,
        enum: ["transferencia", "efectivo", "webpay", "mercadopago", null],
        default: null,
      },
    },

    canceladaEn: { type: Date, default: null },
    motivoCancelacion: { type: String, default: "" },
  },
  { timestamps: true },
);

// Evita doble inscripción activa del mismo cliente a la misma sesión,
// pero permite volver a inscribirse después de haber cancelado.
InscripcionClaseSchema.index(
  { clase: 1, fecha: 1, cliente: 1 },
  { unique: true, partialFilterExpression: { estado: { $ne: "cancelada" } } },
);

InscripcionClaseSchema.index({ empresa: 1, cliente: 1, tipoAcceso: 1 });

export default mongoose.model("InscripcionClase", InscripcionClaseSchema);
