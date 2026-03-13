import clienteServicioStatsModel from "../models/clienteServicioStats.model.js";

export const actualizarClienteServicioStats = async ({
  clienteId, servicioId, empresaId, fechaReserva
}) => {
  const stats = await clienteServicioStatsModel.findOne({
    cliente: clienteId, servicio: servicioId, empresa: empresaId
  });

if (!stats) {
    await clienteServicioStatsModel.create({ // ✅ nombre correcto
      cliente: clienteId, servicio: servicioId, empresa: empresaId,
      ultimaReserva: fechaReserva,
      totalReservas: 1,
      promedioDias: 0
    });
    return;
  }

  const diasDesdeUltima =
    (new Date(fechaReserva) - new Date(stats.ultimaReserva)) / (1000 * 60 * 60 * 24);

  // ✅ Fix: usar totalReservas directamente (no -1) para incluir este intervalo
  const nuevoPromedio = stats.totalReservas === 1
    ? diasDesdeUltima
    : (stats.promedioDias * (stats.totalReservas - 1) + diasDesdeUltima) / stats.totalReservas;

  stats.totalReservas += 1;
  stats.ultimaReserva = fechaReserva;
  stats.promedioDias = Math.round(nuevoPromedio);
  stats.ultimaNotificacion = null; // ✅ Fix: resetear para el nuevo ciclo

  await stats.save();
};