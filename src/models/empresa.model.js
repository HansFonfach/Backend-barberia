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
    usaHorasAncla: { type: Boolean, default: false }, // 👈 aquí dentro
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

  perfilProfesional: {
    aniosExperiencia: { type: Number, default: null },
    especialidades: [{ type: String }],
    fotoPerfil: {
      url: { type: String, default: null }, // URL de Cloudinary
      publicId: { type: String, default: null }, // Para poder eliminarla/reemplazarla
    },
  },

  pagos: {
    requiereAbono: { type: Boolean, default: false },
    tipoAbono: {
      type: String,
      enum: ["fijo", "porcentaje"],
      default: "fijo",
    },
    montoAbonoFijo: { type: Number, default: 0 }, // si tipoAbono === "fijo"
    porcentajeAbono: { type: Number, default: 0 }, // si tipoAbono === "porcentaje"
    transferencia: {
      banco: { type: String, default: "" },
      tipoCuenta: { type: String, default: "" },
      numeroCuenta: { type: String, default: "" },
      titular: { type: String, default: "" },
      rut: { type: String, default: "" },
      correo: { type: String, default: "" },
    },
  },

  // Configuración de reservas
  anticipacionMinima: { type: Number, default: 30 }, // minutos mínimos antes de reservar
  anticipacionMaxima: { type: Number, default: 15 }, // días máximos hacia adelante (ya tienes diasMostradosCalendario, podrían unificarse)
  mensajeBienvenida: { type: String, default: "" }, // texto personalizado en la página pública

  // Política de cancelación
  politicaCancelacion: {
    permiteCancelacion: { type: Boolean, default: true },
    horasLimite: { type: Number, default: 24 }, // hasta X horas antes puede cancelar
    mensajePolitica: { type: String, default: "" },
  },
});

export default mongoose.model("Empresa", EmpresaSchema);
