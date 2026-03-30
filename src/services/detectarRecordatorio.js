import clienteServicioStatsModel from "../models/clienteServicioStats.model.js";

export const detectarRecordatorios = async () => {
  const hoy = new Date();

  const stats = await clienteServicioStatsModel
    .find({
      ultimaReserva: { $ne: null },
      promedioDias: { $gt: 0 },
    })
    .populate({ path: "servicio", match: { recordatorioActivo: true } })
    .populate("cliente")
    .populate({
      path: "empresa",
      match: { recordatoriosRetencionActivo: true }, // 👈 solo empresas con toggle activo
    });
  const clientesRecordar = [];

  for (const s of stats) {
    if (!s.servicio) {
    
      continue;
    }

    if (!s.empresa) {
    
      continue;
    }

    const diasDesdeUltima =
      (hoy - new Date(s.ultimaReserva)) / (1000 * 60 * 60 * 24);

    const diasObjetivo =
      s.servicio.diasRecomendadosRepeticion || s.promedioDias || 15;


    if (!diasObjetivo) continue;
    if (diasDesdeUltima < diasObjetivo) continue;

    if (s.ultimaNotificacion) {
      const diasDesdeNotif =
        (hoy - new Date(s.ultimaNotificacion)) / (1000 * 60 * 60 * 24);
      if (diasDesdeNotif < diasObjetivo) continue;
    }

    clientesRecordar.push(s);
  }

  return clientesRecordar;
};
