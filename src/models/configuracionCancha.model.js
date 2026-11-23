// Configuración del módulo de canchas (rubro "cancha", modulos.canchas).
// Una por empresa. Hoy cubre un recinto con UNA cancha que se arrienda
// completa o por mitades (A y B), en bloques de 1 hora que parten siempre
// en punto (19:00, 20:00...).
import mongoose from "mongoose";

const { Schema } = mongoose;

const HORA = /^([01]\d|2[0-3]):00$/;

const diaHorarioSchema = new Schema(
  {
    dia: { type: Number, min: 0, max: 6, required: true }, // 0 = domingo
    activo: { type: Boolean, default: false },
    // Primera y ÚLTIMA hora que se puede agendar (inclusive): 19:00 a 22:00
    // ofrece 19:00, 20:00, 21:00 y 22:00.
    desde: { type: String, match: HORA, default: "19:00" },
    hasta: { type: String, match: HORA, default: "22:00" },
  },
  { _id: false },
);

const diaCerradoSchema = new Schema(
  {
    fecha: { type: String, match: /^\d{4}-\d{2}-\d{2}$/, required: true },
    motivo: { type: String, trim: true, maxlength: 120, default: "" },
  },
  { _id: false },
);

export const HORARIO_DEFECTO = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
  dia,
  activo: dia >= 1 && dia <= 5, // lunes a viernes
  desde: "19:00",
  hasta: "22:00",
}));

const configuracionCanchaSchema = new Schema(
  {
    empresa: { type: Schema.Types.ObjectId, ref: "Empresa", required: true, unique: true },

    nombreCancha: { type: String, trim: true, maxlength: 60, default: "Cancha principal" },
    superficie: { type: String, trim: true, maxlength: 60, default: "Pasto sintético" },
    jugadoresCompleta: { type: String, trim: true, maxlength: 30, default: "7 vs 7" },
    jugadoresMedia: { type: String, trim: true, maxlength: 30, default: "5 vs 5" },
    permiteMedia: { type: Boolean, default: true },

    horario: { type: [diaHorarioSchema], default: HORARIO_DEFECTO },
    diasCerrados: { type: [diaCerradoSchema], default: [] },

    precios: {
      completa: { type: Number, min: 0, default: 70000 },
      media: { type: Number, min: 0, default: 35000 },
    },

    // Abono opcional: si está activo, la reserva web queda "pendiente" hasta
    // que el recinto marque el abono como pagado.
    abono: {
      activo: { type: Boolean, default: false },
      porcentaje: { type: Number, min: 1, max: 100, default: 50 },
      instrucciones: { type: String, trim: true, maxlength: 600, default: "" },
    },

    // Reglas del recinto que el cliente debe aceptar al reservar
    reglas: {
      type: [{ type: String, trim: true, maxlength: 200 }],
      default: [
        "Solo se puede jugar con zapatillas: no se permiten zapatos de fútbol con estoperoles.",
        "Llega 10 minutos antes: el bloque termina a la hora exacta.",
      ],
    },
    mensajePublico: { type: String, trim: true, maxlength: 500, default: "" },

    confirmacionAutomatica: { type: Boolean, default: true },
    anticipacion: {
      diasMaximo: { type: Number, min: 1, max: 120, default: 30 },
      minutosMinimo: { type: Number, min: 0, max: 1440, default: 60 },
    },
    cancelacion: {
      permitidaWeb: { type: Boolean, default: true },
      horasMinimo: { type: Number, min: 0, max: 168, default: 12 },
    },
    // Cuántas reservas futuras activas puede tener un mismo teléfono desde la web
    maxReservasPorTelefono: { type: Number, min: 1, max: 20, default: 3 },

    recordatorio: {
      activo: { type: Boolean, default: true },
      horasAntes: { type: Number, min: 1, max: 48, default: 3 },
    },
    // WhatsApp que reciben el aviso de reservas nuevas (dueño / encargado)
    telefonosAviso: { type: [{ type: String, trim: true, maxlength: 20 }], default: [] },
  },
  { timestamps: true },
);

export default mongoose.model("ConfiguracionCancha", configuracionCanchaSchema, "configuracioncanchas");
