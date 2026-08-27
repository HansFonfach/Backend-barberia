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
    email: { type: String, required: true, lowercase: true, trim: true },
    // required: true se sacó de acá porque para empresas de rubro "gimnasio"
    // el teléfono es opcional (ver usuarioController.crearCliente, que sigue
    // exigiéndolo en el resto de los rubros). RUT ya era opcional a nivel de
    // schema (se valida también en el controlador según el rubro).
    telefono: { type: String },
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
    faltas: {
      type: Number,
      default: 0,
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
      numeroColegiado: { type: String, default: null }, // ← NUEVO, para profesionales de salud
      fotoPerfil: {
        url: { type: String, default: null },
        publicId: { type: String, default: null },
      },
    },

    // Perfil de entrenamiento personal (modulos.entrenamientoPersonal):
    // 100% opcional, lo completa el propio cliente si quiere. Se usa para
    // calcular calorías/macros (fórmula Mifflin-St Jeor) y para elegir la
    // rutina sugerida — ver entrenamientoPersonalController.js. Nunca se
    // usa para etiquetar a la persona (nada de IMC ni "estado corporal").
    perfilEntrenamiento: {
      objetivo: {
        type: String,
        enum: ["bajar_grasa", "subir_masa", "mantenimiento", "resistencia"],
        default: null,
      },
      sexoBiologico: {
        type: String,
        enum: ["masculino", "femenino"],
        default: null,
      },
      fechaNacimiento: { type: Date, default: null },
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

    notasProfesional: {
      type: String,
      trim: true,
      default: "",
    },

    ultimoEmailSuscripcion: Date,
    ultimoEmailSuscripcion: { type: Date, default: null },
    intentosEmailSuscripcion: { type: Number, default: 0 },
  },

  { timestamps: true },
);

UsuarioSchema.index({ empresa: 1, rut: 1 }, { unique: true, sparse: true });
UsuarioSchema.index(
  { empresa: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: { rol: "cliente" },
  },
);
UsuarioSchema.index({ empresa: 1, rol: 1 });

export default model("Usuario", UsuarioSchema);
