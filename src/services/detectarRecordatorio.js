import clienteServicioStatsModel from "../models/clienteServicioStats.model.js";
import reservaModel from "../models/reserva.model.js";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);
dayjs.extend(timezone);

// =============================================
// Calcula barbero favorito y hora favorita
// del cliente para un servicio específico
// =============================================
const enriquecerConDatosFavoritos = async (clienteId, servicioId, empresaId) => {
  const reservas = await reservaModel
    .find({
      cliente: clienteId,
      servicio: servicioId,
      empresa: empresaId,
      estado: { $in: ["completada", "terminada", "finalizada"] },
    })
    .select("barbero fecha")
    .sort({ fecha: -1 })
    .limit(20); // últimas 20 reservas es más que suficiente

  if (!reservas.length) return null;

  // ── Barbero favorito ──────────────────────────────
  const conteoBarberos = {};
  for (const r of reservas) {
    const id = r.barbero?.toString();
    if (!id) continue;
    conteoBarberos[id] = (conteoBarberos[id] || 0) + 1;
  }

  const [barberoFavoritoId, visitasBarbero] = Object.entries(conteoBarberos)
    .sort((a, b) => b[1] - a[1])[0] || [null, 0];

  const tieneBarberoFavorito = visitasBarbero / reservas.length >= 0.7;

  // ── Hora favorita ─────────────────────────────────
  const conteoHoras = {};
  for (const r of reservas) {
    const hora = dayjs(r.fecha).tz("America/Santiago").format("HH:mm");
    conteoHoras[hora] = (conteoHoras[hora] || 0) + 1;
  }

  const [horaFavorita] = Object.entries(conteoHoras)
    .sort((a, b) => b[1] - a[1])[0] || [null];

  return {
    barberoFavoritoId: tieneBarberoFavorito ? barberoFavoritoId : null,
    horaFavorita, // ej: "18:00"
    totalReservasAnalizadas: reservas.length,
  };
};

// =============================================
// Detectar clientes que deben recibir recordatorio
// =============================================
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
    .populate("empresa");

  const clientesRecordar = [];

  for (const s of stats) {
    if (!s.servicio) continue;
    if (!s.cliente) continue;
    if (!s.empresa) {
      console.warn(`⚠️  Stats ${s._id}: empresa no encontrada`);
      continue;
    }

    if (!s.empresa.recordatoriosRetencionActivo) continue;

    const diasDesdeUltima =
      (hoy - new Date(s.ultimaReserva)) / (1000 * 60 * 60 * 24);

    const diasObjetivo =
      s.servicio.diasRecomendadosRepeticion || s.promedioDias || 15;

    if (diasDesdeUltima < diasObjetivo) continue;

    if (s.ultimaNotificacion) {
      const diasDesdeNotif =
        (hoy - new Date(s.ultimaNotificacion)) / (1000 * 60 * 60 * 24);
      if (diasDesdeNotif < diasObjetivo) continue;
    }

    // ✅ Enriquecer con barbero favorito y hora favorita
    const favoritos = await enriquecerConDatosFavoritos(
      s.cliente._id,
      s.servicio._id,
      s.empresa._id
    );

    clientesRecordar.push({
      ...s.toObject(),
      // sobreescribimos con los objetos populados
      cliente: s.cliente,
      servicio: s.servicio,
      empresa: s.empresa,
      // datos favoritos calculados
      barberoFavoritoId: favoritos?.barberoFavoritoId || null,
      horaFavorita: favoritos?.horaFavorita || null,
    });
  }

  return clientesRecordar;
};