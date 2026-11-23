import cron from "node-cron";
import Empresa from "../models/empresa.model.js";
import ConfiguracionCancha from "../models/configuracionCancha.model.js";
import ReservaCancha from "../models/reservaCancha.model.js";
import { entradaHistorial } from "../services/reservasMesa/utilidades.js";
import { correoRecordatorio, whatsappRecordatorio } from "../services/canchas/notificaciones.js";
import { revisarTodas, vencerPasadas } from "../services/canchas/listaEspera.js";

// Módulo de canchas. Cada 15 minutos:
//  1. Recordatorio (correo + WhatsApp) a las reservas confirmadas que
//     empiezan dentro de las "horas antes" configuradas. Si se reservó dentro
//     de esa ventana no se manda (acaban de reservar). El envío se marca antes
//     de mandar (findOneAndUpdate atómico) para no duplicar.
//  2. Las reservas confirmadas que ya terminaron pasan solas a "completada"
//     (el encargado puede corregir a "no llegaron" después).
//  3. Lista de espera: vence las de horas pasadas y revisa si se liberó
//     algo por otro camino (el aviso normal sale al momento de cancelar).
// Se saltan los recintos inactivos, suspendidos o sin el módulo.

const empresaActiva = async (id) => {
  const empresa = await Empresa.findById(id)
    .select("nombre slug telefono direccion correo logo estado estadoSuscripcion modulos")
    .lean();
  if (!empresa?.modulos?.canchas || empresa.estado === "inactivo") return null;
  if (["suspendido", "cancelado"].includes(empresa.estadoSuscripcion)) return null;
  return empresa;
};

export const enviarRecordatoriosCancha = async (ahora = new Date()) => {
  const configs = await ConfiguracionCancha.find({ "recordatorio.activo": true }).lean();
  let enviados = 0;
  for (const config of configs) {
    const empresa = await empresaActiva(config.empresa);
    if (!empresa) continue;

    const ventanaMs = (config.recordatorio.horasAntes || 3) * 3600000;
    const candidatas = await ReservaCancha.find({
      empresa: empresa._id,
      estado: "confirmada",
      ejemplo: { $ne: true },
      recordatorioEnviadoEn: null,
      inicio: { $gt: ahora, $lte: new Date(ahora.getTime() + ventanaMs) },
    })
      .select("_id inicio createdAt")
      .lean();

    for (const c of candidatas) {
      if (new Date(c.createdAt).getTime() > new Date(c.inicio).getTime() - ventanaMs) continue;
      const reserva = await ReservaCancha.findOneAndUpdate(
        { _id: c._id, recordatorioEnviadoEn: null },
        { $set: { recordatorioEnviadoEn: new Date() } },
        { new: true },
      ).lean();
      if (!reserva) continue; // otro proceso ya lo tomó

      if (reserva.cliente.email) await correoRecordatorio(reserva, empresa, { config });
      await whatsappRecordatorio(reserva, empresa, config, ahora);
      enviados++;
      await new Promise((ok) => setTimeout(ok, 300));
    }
  }
  return enviados;
};

export const completarJugadas = async (ahora = new Date()) => {
  // Bloques de 1 hora: terminó si empezó hace más de 60 minutos
  const limite = new Date(ahora.getTime() - 60 * 60000);
  const r = await ReservaCancha.updateMany(
    { estado: "confirmada", inicio: { $lte: limite } },
    { $set: { estado: "completada" }, $push: { historial: entradaHistorial(null, "Jugada", { detalle: "Automático al terminar la hora" }) } },
  );
  return r.modifiedCount || 0;
};

export const iniciarCronCanchas = () => {
  cron.schedule(
    "*/15 * * * *",
    async () => {
      try {
        const n = await enviarRecordatoriosCancha();
        if (n) console.log(`⚽ Recordatorios de cancha enviados: ${n}`);
      } catch (error) {
        console.error("❌ Cron recordatorios de cancha:", error.message);
      }
      try {
        const c = await completarJugadas();
        if (c) console.log(`⚽ Reservas de cancha marcadas como jugadas: ${c}`);
      } catch (error) {
        console.error("❌ Cron completar reservas de cancha:", error.message);
      }
      try {
        await vencerPasadas();
        const a = await revisarTodas();
        if (a) console.log(`⚽ Avisos de cancha liberada enviados: ${a}`);
      } catch (error) {
        console.error("❌ Cron lista de espera de cancha:", error.message);
      }
    },
    { timezone: "America/Santiago" },
  );
};
