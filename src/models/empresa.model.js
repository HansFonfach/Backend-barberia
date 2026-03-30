import mongoose from "mongoose";

const EmpresaSchema = new mongoose.Schema({
  rutEmpresa: {
    type: String,
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
    enum: ["barberia", "peluqueria", "salon_belleza", "spa", "centro_estetica" ,"otros"],
  },
  estado: {
    type: String,
    enum: ["activo", "inactivo"],
    default: "activo",
  },
  logo: {
    url: { type: String, default: null },
    publicId: { type: String, default: null },
  },

  descripcion: String,
  direccion: String,
  telefono: String,
  correo: String,
  horarios: String,

  
  redes: {
    instagram: String,
    facebook: String,
    tiktok: String,
    youtube: String,
  },

  // ====== THEME / PERSONALIZACIÓN ======
  colores: {
    primario: { type: String, default: "#5e72e4" },
    secundario: { type: String, default: "#2dce89" },
    fondo: { type: String, default: "#FFFFFF" },
    texto: { type: String, default: "#172b4d" },
    textoMuted: { type: String, default: "#8898aa" },
    heroBg: String,
    heroEsClaro: { type: Boolean, default: false }, // 👈 agregar esto
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

  recordatoriosRetencionActivo: {
    type: Boolean,
    default: false, // opt-in, no opt-out
  },

  trial: {
    activo: { type: Boolean, default: true },
    inicio: { type: Date, default: Date.now },
    fin: {
      type: Date,
      default: () => {
        const fecha = new Date();
        fecha.setDate(fecha.getDate() + 7);
        return fecha;
      },
    },
  },

  plan: {
    type: String,
    default: "trial", // trial | activo | vencido
  },
});

export default mongoose.model("Empresa", EmpresaSchema);
