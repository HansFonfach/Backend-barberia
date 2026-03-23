import mongoose, { Schema, model } from "mongoose";

const UsuarioSchema = new Schema(
  {
    empresa: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
    },

    rut: { type: String },
    nombre: { type: String, required: true },
    apellido: { type: String },
    email: { type: String, required: true },
    telefono: { type: String, required: true },
    suscrito: { type: Boolean, default: false },
    password: { type: String, default: null },
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
    esAdmin: { type: Boolean, default: false },
    plan: {
      type: String,
      enum: ["gratis", "premium"],
      default: "gratis",
    },
    perfilProfesional: {
      aniosExperiencia: { type: Number, default: null },
      especialidades: [{ type: String }],
      fotoPerfil: {
        url: { type: String, default: null },
        publicId: { type: String, default: null },
      },
    },
    maxReservas: { type: Number, default: 2 },
    puntos: { type: Number, default: 0 },
    descripcion: { type: String },
    deletedAt: { type: Date, default: null },
    horariosDisponibles: [{ type: Schema.Types.ObjectId, ref: "Horario" }],
    verificationToken: { type: String, default: null },
    verificationTokenExpires: { type: Date, default: null },
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
    pendingPassword: { type: String, default: null },
  },

  { timestamps: true },
);

UsuarioSchema.index({ empresa: 1, rut: 1 }, { unique: true, sparse: true });
UsuarioSchema.index({ empresa: 1, email: 1 }, { unique: true });
UsuarioSchema.index({ empresa: 1, rol: 1 });

export default model("Usuario", UsuarioSchema);
