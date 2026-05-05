import mongoose from "mongoose";

const { Schema } = mongoose;

const ReservaSchema = new Schema(
  {
    empresa: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
    },
    cliente: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      required: false,
    },
    invitado: {
      nombre: { type: String },
      telefono: { type: String },
      email: { type: String },
      token: { type: String }, // UUID único para acceder/cancelar
    },
    barbero: { type: Schema.Types.ObjectId, ref: "Usuario", required: true },
    servicio: { type: Schema.Types.ObjectId, ref: "Servicio", required: true },

    fecha: { type: Date, required: true }, // inicio real
    duracion: { type: Number, required: true }, // ⬅️ NUEVO (minutos)

    estado: {
      type: String,
      enum: [
        "pendiente",
        "confirmada",
        "cancelada",
        "completada",
        "no_asistio",
        "reagendada",
      ],
      default: "pendiente",
    },

    reagendamiento: {
      reagendadaDe: {
        type: Schema.Types.ObjectId,
        ref: "Reserva",
        default: null,
      }, // ID de la reserva original
      fechaAnterior: { type: Date, default: null }, // fecha antes del cambio
      reagendadaEn: { type: Date, default: null }, // cuándo se hizo el cambio
      reagendadaPor: {
        type: Schema.Types.ObjectId,
        ref: "Usuario",
        default: null,
      }, // admin que lo hizo
    },

    abono: {
      requerido: { type: Boolean, default: false },
      monto: { type: Number, default: 0 },
      tipoCalculo: {
        type: String,
        enum: ["fijo", "porcentaje"],
        default: "fijo",
      },
      porcentajeAplicado: { type: Number, default: 0 },

      estado: {
        type: String,
        enum: ["pendiente", "pagado", "rechazado"],
        default: "pendiente",
      },

      controlClinico: {
        type: Schema.Types.ObjectId,
        ref: "ControlNutricional",
        default: null,
      },
      metodo: {
        type: String,
        enum: ["transferencia", "mercadopago", "webpay", "efectivo"],
        default: "transferencia",
      },
      comprobante: {
        url: String,
        publicId: String,
      },
      transaccion: {
        proveedor: String,
        idTransaccion: String,
        estadoPago: String,
        montoPagado: Number,
        moneda: { type: String, default: "CLP" },
        fechaPago: Date,
        respuestaProveedor: Schema.Types.Mixed,
      },
      pagadoEn: Date,
    },

    // pagos[] queda igual que antes, sin tocar
    pagos: [
      {
        tipo: { type: String, enum: ["abono", "pago_total", "saldo"] },
        monto: Number,
        metodo: String,
        estado: String,
        proveedor: String,
        idTransaccion: String,
        fechaPago: Date,
      },
    ],

    puntosOtorgados: { type: Number, default: 10 },
    puntosSumados: { type: Boolean, default: false },

    fechaRecordatorio: { type: Date },

    confirmacionUsuario: { type: Boolean, default: false },
    fechaConfirmacion: { type: Date },

    motivoCancelacion: { type: String },
    cancelToken: {
      type: String,
      default: null,
    },
    cancelTokenExpira: {
      type: Date,
    },
    recordatorioEnviado: { type: Boolean, default: false }, // 24h — ya existe
    recordatorio3hEnviado: { type: Boolean, default: false }, // 3h — agregar esto

    confirmacionAsistencia: {
      solicitada: { type: Boolean, default: false },
      respondida: { type: Boolean, default: false },
      respuesta: { type: String, enum: ["confirma", "cancela"], default: null },
      token: { type: String, default: null }, // para el link del correo
      enviadaEn: { type: Date },
      respondidaEn: { type: Date },
    },
    confirmacionAsistenciaEnviada: { type: Boolean, default: false }, // flag para el cron
  },

  { timestamps: true },
);
ReservaSchema.index({ barbero: 1, fecha: 1, estado: 1 });
ReservaSchema.index({ empresa: 1, fecha: 1 });

export default mongoose.model("Reserva", ReservaSchema);
