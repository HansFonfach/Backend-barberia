import mongoose from "mongoose";

const clienteServicioStatsSchema = new mongoose.Schema({
  cliente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Usuario",
    required: true,
  },

  servicio: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Servicio",
    required: true,
  },

  empresa: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Empresa",
    required: true,
  },

  ultimaReserva: {
    type: Date,
    default: null,
  },

  totalReservas: {
    type: Number,
    default: 0,
  },

  promedioDias: {
    type: Number,
    default: 0,
  },

  ultimaNotificacion: {
    type: Date,
    default: null,
  }
});

export default mongoose.model(
  "ClienteServicioStats",
  clienteServicioStatsSchema
);