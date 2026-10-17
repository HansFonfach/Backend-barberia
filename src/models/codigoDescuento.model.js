import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Código de descuento que crea el admin del negocio (ej. "DIADELPROFE").
 *
 * - Aplica solo a los servicios elegidos.
 * - Puede vencer por fecha y/o por cupos; vence con lo primero que se cumpla.
 * - Los usos NO se guardan acá: se cuentan desde las reservas que lo usaron
 *   (reserva.codigoDescuento.codigoId), así una cancelación libera el cupo
 *   sola, sin tener que tocar el flujo de cancelación.
 */
const CodigoDescuentoSchema = new Schema(
  {
    empresa: {
      type: Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
      index: true,
    },

    // Siempre en MAYÚSCULAS y sin espacios (el cliente puede escribirlo como quiera)
    codigo: { type: String, required: true, trim: true, uppercase: true },

    descripcion: { type: String, default: "" },

    tipo: {
      type: String,
      enum: ["porcentaje", "monto"],
      required: true,
    },
    // porcentaje: 1-100 | monto: pesos CLP
    valor: { type: Number, required: true, min: 1 },

    // Solo estos servicios aceptan el código
    servicios: [{ type: Schema.Types.ObjectId, ref: "Servicio" }],

    // Ventana en la que se puede USAR el código (día de Chile, ambos inclusive).
    // null = sin límite de ese lado.
    fechaInicio: { type: Date, default: null },
    fechaFin: { type: Date, default: null },

    // null = sin límite de cupos
    cupos: { type: Number, default: null, min: 1 },
    // null = sin límite por cliente
    maxUsosPorCliente: { type: Number, default: null, min: 1 },

    // Interruptor para pausar sin borrar
    activo: { type: Boolean, default: true },

    creadoPor: { type: Schema.Types.ObjectId, ref: "Usuario", default: null },
  },
  { timestamps: true },
);

// Un mismo código no se puede repetir dentro del mismo negocio
CodigoDescuentoSchema.index({ empresa: 1, codigo: 1 }, { unique: true });

export default mongoose.model(
  "CodigoDescuento",
  CodigoDescuentoSchema,
  "codigosDescuento",
);
