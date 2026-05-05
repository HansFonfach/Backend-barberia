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
  rubro: {
    type: String,
    required: true,
    enum: [
      // Belleza (lo que ya tienes)
      "barberia",
      "peluqueria",
      "salon_belleza",
      "spa",
      "centro_estetica",
      // Salud (nuevo)
      "nutricion",
      "kinesiologia",
      "psicologia",
      "medicina_general",
      // Genérico
      "otros",
    ],
  },

  // Módulos activos para esta empresa
  modulos: {
    fichaClinica: { type: Boolean, default: false }, // nutrición, kinesi, etc.
    historialControles: { type: Boolean, default: false },
    planAlimentario: { type: Boolean, default: false }, // específico nutrición
    examenesLab: { type: Boolean, default: false },
    // En el futuro puedes agregar: recetas, derivaciones, etc.
  },

  estado: {
    type: String,
    enum: ["activo", "inactivo"],
    default: "activo",
  },
  logo: {
    type: String,
    default: null,
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

  // ====== CONFIGURACIÓN VISUAL ======
  configuracion: {
    modoOscuro: { type: Boolean, default: false },
    compacto: { type: Boolean, default: false },
    mostrarLogo: { type: Boolean, default: true },
    mostrarEstadisticas: { type: Boolean, default: true },
    tipoHero: {
      type: String,
      enum: ["centrado", "split", "minimal"],
      default: "centrado",
    },
    fuente: { type: String, default: "default" },
    borderRadius: { type: String, default: "24px" },
    usaHorasAncla: { type: Boolean, default: false },
  },

  configuracionRubro: {
    // Para rubros de salud
    salud: {
      especialidad: { type: String }, // "nutrición deportiva", "clínica", etc.
      requiereNumColegiado: { type: Boolean, default: false },
      duracionControlDefault: { type: Number, default: 45 }, // minutos
    },
    // Para rubros de belleza (ya los manejas, pero lo explicitamos)
    belleza: {
      usaProductos: { type: Boolean, default: false },
      usaFidelizacion: { type: Boolean, default: false },
    },
  },

  colores: {
    primario: String,
    secundario: String,
    fondo: String,
    texto: String,
    textoMuted: String,
    heroBg: String,
    heroEsClaro: Boolean,
    acento: String,
    sidebar: String,
    navbar: String,
    tarjeta: String,
    bordeTarjeta: String,
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
    horasLimite: { type: Number, default: 24 },
    mensajePolitica: { type: String, default: "" },
    mensajeCancelacionRecordatorio: { type: String, default: "" }, // 👈 agrega esto
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

EmpresaSchema.index({ rubro: 1 });
EmpresaSchema.index({ rubro: 1, estado: 1 });

export default mongoose.model("Empresa", EmpresaSchema);
