import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Configuración del módulo de reservas de mesas (una por empresa).
 *
 * Ningún valor de negocio viene precargado: capacidades, horarios, duración,
 * anticipación, etc. los define cada local desde el panel. Mientras falte lo
 * mínimo (ver `faltantesConfiguracion` en services/reservasMesa/reglas.js),
 * el módulo no acepta reservas.
 */
const SectorSchema = new Schema({
  nombre: { type: String, required: true, trim: true, maxlength: 40 },
  // Personas que se pueden RESERVAR al mismo tiempo en este sector. Si el
  // local quiere dejar lugar para quien llega sin reserva, pone acá un número
  // menor que la capacidad física.
  capacidad: { type: Number, required: true, min: 1 },
  activo: { type: Boolean, default: true },
  reservableOnline: { type: Boolean, default: true },
  orden: { type: Number, default: 0 },
});

const DiaHorarioSchema = new Schema(
  {
    dia: { type: Number, min: 0, max: 6, required: true }, // 0 = domingo
    abierto: { type: Boolean, default: false },
    // Rango de horas de LLEGADA que se aceptan ("HH:mm"). La reserva puede
    // terminar después de "hasta" (por su duración).
    desde: { type: String, default: null },
    hasta: { type: String, default: null },
  },
  { _id: false },
);

const ConfiguracionReservasMesaSchema = new Schema(
  {
    empresa: {
      type: Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
      unique: true,
    },

    sectores: { type: [SectorSchema], default: [] },
    horario: { type: [DiaHorarioSchema], default: [] },

    intervaloMinutos: { type: Number, enum: [15, 30, 60, null], default: null },
    duracionMinutos: { type: Number, default: null }, // múltiplo de 15
    anticipacionMinimaMinutos: { type: Number, default: null },
    anticipacionMaximaDias: { type: Number, default: null },
    maxPersonasPorReserva: { type: Number, default: null }, // panel
    toleranciaMinutos: { type: Number, default: null },

    // Página pública
    reservasWebActivas: { type: Boolean, default: false },
    maxPersonasWeb: { type: Number, default: null },
    confirmacionAutomaticaWeb: { type: Boolean, default: false },
    // Mostrar al cliente cuántos lugares quedan en cada hora y sector
    mostrarCuposWeb: { type: Boolean, default: false },
    mensajePublico: { type: String, default: "", maxlength: 600 },
    mensajeCumpleanos: { type: String, default: "", maxlength: 600 },

    cancelacionWeb: {
      permitida: { type: Boolean, default: false },
      horasLimite: { type: Number, default: null },
    },

    recordatorio: {
      activo: { type: Boolean, default: false },
      horasAntes: { type: Number, default: null },
    },

    // Contacto que ve el cliente cuando no queda lugar en línea
    contactoWeb: {
      whatsapp: { type: String, default: "" }, // número para consultas (si no, el teléfono del local)
      mensajeSinLugar: { type: String, default: "", maxlength: 300 },
    },

    // Lista de espera cuando un día no queda lugar para el grupo
    listaEspera: {
      activa: { type: Boolean, default: false },
    },

    // WhatsApp (plantillas de Meta: ver services/reservasMesa/whatsapp.js)
    whatsapp: {
      // Aviso al local por cada reserva nueva hecha en la web
      avisoLocal: {
        activo: { type: Boolean, default: false },
        telefonos: { type: [String], default: [] },
      },
      // Mensaje al cliente para que confirme si viene
      confirmacion: {
        activo: { type: Boolean, default: false },
        horasAntes: { type: Number, default: null },
      },
    },

    // Qué puede hacer el personal que no es admin
    permisosPersonal: {
      cancelar: { type: Boolean, default: false },
      forzarSobrecupo: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

export default mongoose.model(
  "ConfiguracionReservasMesa",
  ConfiguracionReservasMesaSchema,
  "configuracionesReservasMesa",
);
