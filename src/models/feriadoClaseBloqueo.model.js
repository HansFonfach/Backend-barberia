import mongoose from "mongoose";

const { Schema } = mongoose;

// Bloqueo de un feriado para el módulo de clases grupales de UNA empresa en
// particular. El modelo `Feriado` (feriados.js) es global y solo lo usa el
// flujo de barbería (utils/feriados.js + excepcionHorario) — no lo tocamos.
//
// Para clases, el feriado aparece HABILITADO por defecto (las sesiones se
// generan y se pueden reservar con normalidad); la ausencia de un documento
// acá significa exactamente eso. Cuando el admin del gimnasio decide
// bloquear el día completo, se crea un documento para esa fecha+empresa, y
// `resolverSesionValida`/`generarSesionesDisponibles` (claseController.js)
// lo consultan para no ofrecer/permitir sesiones ese día — salvo que una
// clase puntual tenga una ExcepcionClase de tipo "forzar_habilitada" para
// esa misma fecha, que la deja funcionando igual pese al bloqueo del día.
const FeriadoClaseBloqueoSchema = new Schema(
  {
    empresa: {
      type: Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
      index: true,
    },

    // Día bloqueado, normalizado a las 00:00 (zona America/Santiago)
    fecha: { type: Date, required: true, index: true },

    // Nombre/motivo informativo (ej. "Año Nuevo"), opcional
    motivo: { type: String, default: "" },
  },
  { timestamps: true },
);

FeriadoClaseBloqueoSchema.index({ empresa: 1, fecha: 1 }, { unique: true });

export default mongoose.model(
  "FeriadoClaseBloqueo",
  FeriadoClaseBloqueoSchema,
);
