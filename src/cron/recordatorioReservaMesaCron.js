import cron from "node-cron";
import Empresa from "../models/empresa.model.js";
import ConfiguracionReservasMesa from "../models/configuracionReservasMesa.model.js";
import ReservaMesa from "../models/reservaMesa.model.js";
import { correoRecordatorio } from "../services/reservasMesa/correos.js";
import { generarTokenCancelacion } from "../services/reservasMesa/utilidades.js";

// Recordatorio por correo de las reservas de mesa. Corre cada 15 minutos y
// manda el aviso a las reservas que empiezan dentro de las "horas antes" que
// configuró cada local. Solo para locales que activaron el recordatorio.
//
// - Una reserva hecha DENTRO de esa ventana no recibe recordatorio (acaba de
//   reservar, no hace falta).
// - El envío se marca antes de mandar (findOneAndUpdate atómico), así un
//   reinicio o dos instancias no lo mandan dos veces.

export const enviarRecordatoriosReservasMesa = async (ahora = new Date()) => {
  const configs = await ConfiguracionReservasMesa.find({
    "recordatorio.activo": true,
    "recordatorio.horasAntes": { $gte: 1 },
  }).lean();

  let enviados = 0;
  for (const config of configs) {
    const empresa = await Empresa.findById(config.empresa)
      .select("nombre slug telefono direccion estado estadoSuscripcion modulos")
      .lean();
    if (!empresa?.modulos?.reservasMesas || empresa.estado === "inactivo") continue;
    if (["suspendido", "cancelado"].includes(empresa.estadoSuscripcion)) continue;

    const ventanaMs = config.recordatorio.horasAntes * 3600000;
    const hasta = new Date(ahora.getTime() + ventanaMs);

    const candidatas = await ReservaMesa.find({
      empresa: empresa._id,
      estado: { $in: ["pendiente", "confirmada"] },
      recordatorioEnviadoEn: null,
      "cliente.email": { $nin: [null, ""] },
      inicio: { $gt: ahora, $lte: hasta },
    })
      .select("_id inicio createdAt")
      .lean();

    for (const c of candidatas) {
      if (new Date(c.createdAt).getTime() > new Date(c.inicio).getTime() - ventanaMs) continue;

      const token = config.cancelacionWeb?.permitida ? generarTokenCancelacion() : null;
      const reserva = await ReservaMesa.findOneAndUpdate(
        { _id: c._id, recordatorioEnviadoEn: null },
        {
          $set: { recordatorioEnviadoEn: new Date() },
          ...(token ? { $push: { tokensCancelacion: token.hash } } : {}),
        },
        { new: true },
      );
      if (!reserva) continue; // otro proceso ya lo tomó

      await correoRecordatorio(reserva, empresa, { token: token?.token || null, config });
      enviados++;
    }
  }
  return enviados;
};

export const iniciarCronRecordatorioReservasMesa = () => {
  cron.schedule(
    "*/15 * * * *",
    async () => {
      try {
        const n = await enviarRecordatoriosReservasMesa();
        if (n) console.log(`🍽️  Recordatorios de reservas de mesa enviados: ${n}`);
      } catch (error) {
        console.error("❌ Cron recordatorios reservas de mesa:", error.message);
      }
    },
    { timezone: "America/Santiago" },
  );
};
