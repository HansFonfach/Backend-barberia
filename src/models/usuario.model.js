import { Schema, model } from "mongoose";

const UsuarioSchema = new Schema(
  {
    rut: { type: String, unique: true, required: true },
    nombre: { type: String, required: true },
    apellido: { type: String },
    email: { type: String, unique: true, required: true },
    telefono: { type: String, required: true },
    suscrito: { type: Boolean, default: false },
    password: String, // Encriptada con bcryptjs
    estado: {
      type: String,
      enum: ["activo", "inactivo"],
      default: "activo",
    },
    rol: {
      type: String,
      enum: ["cliente", "barbero", "admin"],
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

    horariosDisponibles: [{ type: Schema.Types.ObjectId, ref: "Horario" }], // solo aplica si es barbero
  },
  { timestamps: true }
);
UsuarioSchema.index({ email: 1 }, { unique: true });
export default model("Usuario", UsuarioSchema);
