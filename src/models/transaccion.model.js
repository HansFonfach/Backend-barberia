import mongoose from "mongoose";

const transaccionSchema = new mongoose.Schema(
  {
    // Información del usuario
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
    },

    // Información de la transacción
    buyOrder: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    sessionId: {
      type: String,
      required: true,
    },

    token: {
      type: String,
      required: true,
    },

    // Estado de la transacción
    estado: {
      type: String,
      enum: ["iniciado", "aprobado", "rechazado", "error", "cancelado"],
      default: "iniciado",
    },

    // Información financiera
    monto: {
      type: Number,
      required: true,
    },

    tipo: {
      type: String,
      enum: ["suscripcion", "servicio_extra", "otro"],
      default: "suscripcion",
    },

    // Respuesta de Transbank
    respuestaTransbank: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    error: {
      type: String,
      default: null,
    },

    // Referencia a suscripción creada
    suscripcion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Suscripcion",
      default: null,
    },

    // Metadata
    metadata: {
      tipoSuscripcion: {
        type: String,
        default: "mensual",
      },
      serviciosIncluidos: {
        type: Number,
        default: 2,
      },
    },

    // Timestamps
    fechaCreacion: {
      type: Date,
      default: Date.now,
    },

    fechaConfirmacion: {
      type: Date,
      default: null,
    },

    fechaError: {
      type: Date,
      default: null,
    },

    // Para auditoría
    ipCliente: {
      type: String,
      default: null,
    },

    userAgent: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true, // Crea createdAt y updatedAt automáticamente
    versionKey: false,
  }
);

// Índices para mejor rendimiento
transaccionSchema.index({ usuario: 1, estado: 1 });
transaccionSchema.index({ createdAt: -1 });
transaccionSchema.index({ estado: 1, fechaCreacion: -1 });

const Transaccion = mongoose.model("Transaccion", transaccionSchema);

export default Transaccion;
