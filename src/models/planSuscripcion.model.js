// models/planSuscripcion.model.js
//
// Plantilla de plan de suscripción que el propio negocio (admin/barbero)
// puede crear desde la app, en vez de tener los planes hardcodeados en el
// controlador (como estaba antes con "creditos", "combo_visita_corte_barba",
// etc.). Cada Suscripcion nueva que se cree a partir de un plan guarda una
// "foto" (planSnapshot) de estos datos al momento de suscribir al cliente,
// para que si el negocio después edita o borra el plan, las suscripciones
// ya activas no se vean afectadas.
import mongoose from "mongoose";

const planSuscripcionSchema = new mongoose.Schema(
  {
    empresa: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
      index: true,
    },

    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, default: "" },

    precio: { type: Number, required: true, min: 0 },

    // Duración total del plan en días (30 = un mes, 365 = un año, etc.)
    duracionDias: { type: Number, required: true, min: 1 },

    // Cada cuántos días se resetea la cuota de servicios. Para un plan
    // simple (ej. "2 al mes, dura 1 mes") cicloDias === duracionDias: se
    // usan los cupos una sola vez y la suscripción termina al agotarlos o
    // al llegar la fecha, lo que pase primero (mismo comportamiento de
    // siempre). Para un plan con renovación mensual dentro de un período
    // más largo (ej. "1 servicio al mes, por 12 meses") cicloDias = 30 y
    // duracionDias = 365: la cuota se resetea cada 30 días sin cortar la
    // suscripción completa, y lo que no se usó en el mes no se acumula.
    cicloDias: { type: Number, required: true, min: 1 },

    // Cuántos servicios puede usar el cliente por ciclo.
    cantidadPorCiclo: { type: Number, required: true, min: 1 },

    // Qué servicios puede usar con este plan. Vacío = cualquier servicio
    // de la empresa (equivalente al plan "creditos" de siempre).
    serviciosPermitidos: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Servicio" },
    ],

    // Días de anticipación con los que un suscriptor de este plan puede
    // ver/reservar en el calendario (reemplaza el "40" y el "31" que
    // estaban escritos directo en el controlador de horarios).
    diasVisibilidadCalendario: { type: Number, default: 30, min: 1 },

    activo: { type: Boolean, default: true },
  },
  { timestamps: true },
);

planSuscripcionSchema.index({ empresa: 1, activo: 1 });

export default mongoose.model("PlanSuscripcion", planSuscripcionSchema);
