import mongoose from "mongoose";

const { Schema } = mongoose;

export const ESTADOS_RESERVA_MESA = [
  "pendiente",
  "confirmada",
  "llego",
  "completada",
  "cancelada",
  "no_asistio",
];

export const ORIGENES_RESERVA_MESA = [
  "telefono",
  "presencial",
  "web",
  "whatsapp",
  "instagram",
  "otro",
];

export const MOTIVOS_CANCELACION_MESA = [
  "cliente_cancelo",
  "cliente_no_confirmo",
  "local_no_puede_atender",
  "error_registro",
  "otro",
];

const HistorialSchema = new Schema(
  {
    fecha: { type: Date, default: Date.now },
    usuario: { type: Schema.Types.ObjectId, ref: "Usuario", default: null },
    nombreUsuario: { type: String, default: "" }, // "web" / "cliente" / nombre del staff
    accion: { type: String, required: true }, // creada, editada, estado, sobrecupo...
    detalle: { type: String, default: "" },
    cambios: { type: Schema.Types.Mixed, default: null }, // { campo: [antes, después] }
  },
  { _id: false },
);

/**
 * Reserva de mesa de un bar/restaurante. Colección separada de `Reserva`
 * (que es de servicios con profesional): así estadísticas, crons y pantallas
 * de barbería nunca ven estas reservas.
 *
 * Los datos del cliente van dentro de la reserva (no se crea un Usuario):
 * una reserva por teléfono muchas veces no trae correo, y Usuario lo exige.
 */
const ReservaMesaSchema = new Schema(
  {
    empresa: {
      type: Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
    },

    // Código corto para buscarla al teléfono ("¿me das tu código?")
    codigo: { type: String, required: true },

    cliente: {
      nombre: { type: String, required: true, trim: true, maxlength: 80 },
      telefono: { type: String, required: true, trim: true, maxlength: 25 },
      telefonoNormalizado: { type: String, required: true },
      email: { type: String, trim: true, lowercase: true, default: "" },
    },

    // Día y hora de llegada en Chile (para mostrar y filtrar sin zonas horarias)
    fecha: { type: String, required: true }, // "YYYY-MM-DD"
    hora: { type: String, required: true }, // "HH:mm"
    // Mismo momento en UTC + fin según la duración configurada
    inicio: { type: Date, required: true },
    fin: { type: Date, required: true },

    personas: { type: Number, required: true, min: 1 },

    sector: {
      id: { type: Schema.Types.ObjectId, required: true },
      nombre: { type: String, required: true }, // copia: sobrevive a un cambio de nombre
    },

    // Franjas de 15 minutos cuyo contador tiene tomadas las personas de esta
    // reserva. Se guardan para liberar exactamente esas, aunque después
    // cambie la duración configurada.
    franjas: { type: [Date], default: [] },
    ocupaCupo: { type: Boolean, default: false },
    sobrecupo: { type: Boolean, default: false },

    cumpleanos: {
      es: { type: Boolean, default: false },
      festejado: { type: String, default: "", maxlength: 80 },
      detalle: { type: String, default: "", maxlength: 300 },
    },

    comentarios: { type: String, default: "", maxlength: 500 },

    origen: { type: String, enum: ORIGENES_RESERVA_MESA, required: true },

    estado: {
      type: String,
      enum: ESTADOS_RESERVA_MESA,
      default: "confirmada",
    },

    cancelacion: {
      motivo: { type: String, enum: [...MOTIVOS_CANCELACION_MESA, null], default: null },
      detalle: { type: String, default: "" },
      por: { type: String, enum: ["cliente", "local", null], default: null },
      fecha: { type: Date, default: null },
    },

    llegadaEn: { type: Date, default: null },
    completadaEn: { type: Date, default: null },

    historial: { type: [HistorialSchema], default: [] },

    creadaPor: { type: Schema.Types.ObjectId, ref: "Usuario", default: null },

    // Evita duplicados por doble clic o reenvío del formulario
    claveIdempotencia: { type: String, default: null },

    // Links "cancelar mi reserva" (solo se guarda el hash de cada token). Es
    // una lista porque el recordatorio manda un link nuevo y el del correo de
    // confirmación tiene que seguir sirviendo.
    tokensCancelacion: { type: [String], default: [] },

    recordatorioEnviadoEn: { type: Date, default: null },
  },
  { timestamps: true },
);

ReservaMesaSchema.index({ empresa: 1, codigo: 1 }, { unique: true });
ReservaMesaSchema.index({ empresa: 1, inicio: 1 });
ReservaMesaSchema.index({ empresa: 1, fecha: 1, estado: 1 });
ReservaMesaSchema.index({ empresa: 1, "cliente.telefonoNormalizado": 1, fecha: 1 });
ReservaMesaSchema.index(
  { empresa: 1, claveIdempotencia: 1 },
  { unique: true, partialFilterExpression: { claveIdempotencia: { $type: "string" } } },
);
ReservaMesaSchema.index({ tokensCancelacion: 1 });

export default mongoose.model("ReservaMesa", ReservaMesaSchema, "reservasMesa");
