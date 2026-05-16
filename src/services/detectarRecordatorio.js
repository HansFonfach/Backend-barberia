import clienteServicioStatsModel from "../models/clienteServicioStats.model.js";

export const detectarRecordatorios = async () => {
  const hoy = new Date();

  const stats = await clienteServicioStatsModel
    .find({
      ultimaReserva: { $ne: null },
      promedioDias: { $gt: 0 },
    })
    .populate({
      path: "servicio",
      match: { recordatorioActivo: true },
    })
    .populate("cliente")
    .populate("empresa"); // 👈 sin match acá — filtramos abajo manualmente

  for (const s of stats) {
    const rawEmpresa = s.empresa?.toObject({ virtuals: false });
    console.log("RAW empresa:", rawEmpresa); // vas a ver tipo ahí
  }

  const clientesRecordar = [];

  for (const s of stats) {
    console.log(
      `👤 ${s.cliente?.nombre} | empresa: ${s.empresa?.nombre} | empresa.tipo: ${s.empresa?.tipo} | empresa.rubro: ${s.empresa?.rubro}`,
    );
    if (!s.servicio) continue;
    if (!s.cliente) continue;

    // 👇 Filtro manual de empresa con log claro
    if (!s.empresa) {
      console.warn(`⚠️  Stats ${s._id}: empresa no encontrada`);
      continue;
    }

    if (!s.empresa.recordatoriosRetencionActivo) {
      console.log(
        `⏭️  Empresa "${s.empresa.nombre}" tiene recordatorios desactivados`,
      );
      continue;
    }

    const diasDesdeUltima =
      (hoy - new Date(s.ultimaReserva)) / (1000 * 60 * 60 * 24);

    const diasObjetivo =
      s.servicio.diasRecomendadosRepeticion || s.promedioDias || 15;

    console.log(
      `📊 ${s.cliente.nombre} | diasDesdeUltima: ${diasDesdeUltima.toFixed(1)} | diasObjetivo: ${diasObjetivo}`,
    );

    if (diasDesdeUltima < diasObjetivo) {
      console.log(
        `   ⏳ Aún no es momento (faltan ${(diasObjetivo - diasDesdeUltima).toFixed(1)} días)`,
      );
      continue;
    }

    if (s.ultimaNotificacion) {
      const diasDesdeNotif =
        (hoy - new Date(s.ultimaNotificacion)) / (1000 * 60 * 60 * 24);
      if (diasDesdeNotif < diasObjetivo) {
        console.log(
          `   🔕 Ya notificado hace ${diasDesdeNotif.toFixed(1)} días`,
        );
        continue;
      }
    }

    clientesRecordar.push(s);
  }

  console.log(`✅ Clientes a recordar: ${clientesRecordar.length}`);
  return clientesRecordar;
};
