import mongoose, { Schema, model } from "mongoose";

const UsuarioSchema = new Schema(
  {
    empresa: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
    },
    rut: { type: String, unique: true, required: true },
    nombre: { type: String, required: true },
    apellido: { type: String },
    email: { type: String, unique: true, required: true },
    telefono: { type: String, required: true },
    suscrito: { type: Boolean, default: false },
    password: {
      type: String,
      default: null,
    },
    estado: {
      type: String,
      enum: ["activo", "inactivo"],
      default: "activo",
    },
    rol: {
      type: String,
      enum: ["cliente", "barbero", "admin", "invitado"],
      default: "cliente",
    },
    plan: {
      type: String,
      enum: ["gratis", "premium"],
      default: "gratis",
    },
    maxReservas: {
      type: Number,
      default: 2,
    },
    puntos: {
      type: Number,
      default: 0,
    },
    descripcion: {
      type: String,
    },
    deletedAt: {
      type: Date,
      default: null,
    },

    horariosDisponibles: [{ type: Schema.Types.ObjectId, ref: "Horario" }], // solo aplica si es barbero
  },
  { timestamps: true },
);
UsuarioSchema.index({ empresa: 1, rol: 1 });
UsuarioSchema.index({ email: 1 }, { unique: true });
export default model("Usuario", UsuarioSchema);
