import mongoose from "mongoose";

const EmpresaSchema = new mongoose.Schema({
  rutEmpresa: {
    type: String,
    required: true,
  },
  nombre: {
    type: String,
    required: true,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
  },
  tipo: {
    type: String,
    required: true,
    enum: ["barberia", "peluqueria", "salon_belleza", "spa", "centro_estetica"],
  },
  estado: {
    type: String,
    enum: ["activo", "inactivo"],
    default: "activo",
  },
  logo: String,
  banner: String,
  descripcion: String,
  direccion: String,
  telefono: String,
  correo: String,
  profesional: String,
  redes: {
    instagram: String,
    facebook: String,
    tiktok: String,
    youtube: String,
  },

  // ====== THEME / PERSONALIZACIÓN ======
  colores: {
    primario: { type: String, default: "#5e72e4" }, // Color principal
    secundario: { type: String, default: "#2dce89" }, // Color secundario
    fondo: { type: String, default: "#FFFFFF" }, // Color de fondo
    texto: { type: String, default: "#172b4d" }, // Color de texto principal
    textoMuted: { type: String, default: "#8898aa" }, // Color de texto secundario
    heroBg: String, // Fondo del hero (puede ser gradiente)
  },

  // ====== CONFIGURACIÓN VISUAL ======
  configuracion: {
    mostrarLogo: { type: Boolean, default: true },
    mostrarEstadisticas: { type: Boolean, default: true },
    tipoHero: {
      type: String,
      enum: ["centrado", "split", "minimal"],
      default: "centrado",
    },
    fuente: { type: String, default: "default" },
    borderRadius: { type: String, default: "24px" },
  },

  horarios: String,
  creadoEn: {
    type: Date,
    default: Date.now,
  },

  permiteSuscripcion: {
    type: Boolean,
    default: false,
  },
  diasMostradosCalendario: {
    type: Number,
    default: 15,
  },
  envioNotificacionReserva: { type: Boolean, default: false },
  permiteAbonos: {
    type: Boolean,
    default: false,
  },
});

export default mongoose.model("Empresa", EmpresaSchema);
