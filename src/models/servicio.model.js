import mongoose from "mongoose";

const { Schema } = mongoose;

const servicioSchema = new Schema({
  empresa: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Empresa",
    required: true,
  },

  categoria: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Categoria", // 👈 ya estaba bien, ahora coincide con el modelo renombrado
  },

  icono: {
    type: String,
    default: null,
  },

  nombre: { type: String, required: true },
  descripcion: { type: String },

  precio: {
    type: Number,
    required: true,
  },

  activo: {
    type: Boolean,
    default: true,
  },

  instrucciones: { type: String, default: null },
  cuidados: { type: String, default: null },

  diasRecomendadosRepeticion: {
    type: Number,
    default: null,
  },

  recordatorioActivo: {
    type: Boolean,
    default: true,
  },

  descuento: {
    activo: {
      type: Boolean,
      default: false, // 👈 switch manual: si está en false, el descuento nunca aplica, sin importar las fechas
    },
    porcentaje: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    descripcion: {
      type: String,
      default: null, // ej: "Descuento invierno"
    },
    fechaInicio: {
      type: Date,
      default: null, // 👈 nuevo
    },
    fechaFin: {
      type: Date,
      default: null,
    },
  },
});

servicioSchema.methods.calcularPrecioFinal = function (
  fechaReserva = new Date(),
) {
  const descuento = this.descuento;
  if (!descuento?.activo) return this.precio;

  // Normalizar a "solo fecha" en horario de Chile
  const soloFechaChile = (d) => {
    const str = new Date(d).toLocaleDateString("en-CA", {
      timeZone: "America/Santiago",
    }); // "YYYY-MM-DD"
    return str;
  };

  const fechaReservaStr = soloFechaChile(fechaReserva);
  const inicioStr = descuento.fechaInicio
    ? soloFechaChile(descuento.fechaInicio)
    : null;
  const finStr = descuento.fechaFin ? soloFechaChile(descuento.fechaFin) : null;

  const yaComenzo = !inicioStr || fechaReservaStr >= inicioStr;
  const noHaTerminado = !finStr || fechaReservaStr <= finStr;

  if (!yaComenzo || !noHaTerminado) return this.precio;

  const rebaja = Math.round(this.precio * (descuento.porcentaje / 100));
  return this.precio - rebaja;
};

export default mongoose.model("Servicio", servicioSchema);
