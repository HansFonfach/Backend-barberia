// Arriendo de cancha (módulo canchas). Un documento = un bloque de 1 hora,
// de la cancha completa (lados A y B) o de media cancha (A o B).
//
// La doble reserva la impide la base de datos: el índice único sobre
// (empresa, fecha, hora, lados) solo cuenta las reservas "activas", y una
// cancha completa ocupa los dos lados. Así, aunque dos personas reserven al
// mismo segundo, solo una lo logra.
import mongoose from "mongoose";

const { Schema } = mongoose;

const historialSchema = new Schema(
  {
    fecha: { type: Date, default: Date.now },
    usuario: { type: Schema.Types.ObjectId, ref: "Usuario", default: null },
    nombreUsuario: { type: String, default: "web" },
    accion: { type: String, required: true },
    detalle: { type: String, default: "" },
  },
  { _id: false },
);

const reservaCanchaSchema = new Schema(
  {
    empresa: { type: Schema.Types.ObjectId, ref: "Empresa", required: true, index: true },
    codigo: { type: String, required: true },

    fecha: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    hora: { type: String, required: true, match: /^([01]\d|2[0-3]):00$/ },
    inicio: { type: Date, required: true }, // fecha + hora en Chile, para ordenar y recordatorios

    tipo: { type: String, enum: ["completa", "media"], required: true },
    lados: { type: [{ type: String, enum: ["A", "B"] }], required: true },

    estado: {
      type: String,
      enum: ["pendiente", "confirmada", "completada", "no_asistio", "cancelada"],
      default: "confirmada",
      index: true,
    },
    // true mientras la reserva ocupa la cancha (todo menos "cancelada")
    activa: { type: Boolean, default: true },

    cliente: {
      nombre: { type: String, required: true, trim: true, maxlength: 80 },
      telefono: { type: String, required: true, trim: true, maxlength: 20 },
      telefonoNormalizado: { type: String, index: true },
      email: { type: String, trim: true, lowercase: true, maxlength: 120, default: "" },
    },
    equipo: { type: String, trim: true, maxlength: 60, default: "" },
    comentarios: { type: String, trim: true, maxlength: 300, default: "" },

    precio: { type: Number, min: 0, required: true },
    abono: {
      requerido: { type: Boolean, default: false },
      monto: { type: Number, min: 0, default: 0 },
    },
    pago: {
      estado: { type: String, enum: ["pendiente", "abonado", "pagado"], default: "pendiente" },
      montoPagado: { type: Number, min: 0, default: 0 },
      actualizadoEn: { type: Date, default: null },
    },

    origen: { type: String, enum: ["web", "panel"], default: "web" },
    // Reserva fija semanal: varias reservas con el mismo id de serie
    serie: {
      id: { type: String, default: null, index: true },
      numero: { type: Number, default: null },
      total: { type: Number, default: null },
    },
    aceptoReglas: { type: Boolean, default: false },
    // Datos de ejemplo del negocio de demostración (se pueden borrar todos juntos)
    ejemplo: { type: Boolean, default: false },

    tokenCancelacionHash: { type: String, default: null, index: true },
    recordatorioEnviadoEn: { type: Date, default: null },
    cancelacion: {
      fecha: { type: Date, default: null },
      por: { type: String, enum: ["cliente", "local", null], default: null },
      motivo: { type: String, default: "" },
    },
    historial: { type: [historialSchema], default: [] },
  },
  { timestamps: true },
);

reservaCanchaSchema.index(
  { empresa: 1, fecha: 1, hora: 1, lados: 1 },
  { unique: true, partialFilterExpression: { activa: true }, name: "cancha_sin_doble_reserva" },
);
reservaCanchaSchema.index({ empresa: 1, fecha: 1, hora: 1 });
reservaCanchaSchema.index({ empresa: 1, codigo: 1 }, { unique: true });
reservaCanchaSchema.index({ estado: 1, inicio: 1 });

export default mongoose.model("ReservaCancha", reservaCanchaSchema, "reservascancha");
