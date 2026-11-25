// cron/pruebaGratisCron.js
//
// Fin del período de prueba (7 días) de los negocios nuevos. Una vez al día:
//  - al negocio que le quedan 1–2 días: correo "tu prueba termina pronto";
//  - al que se le acaba de vencer: correo "tu prueba terminó";
//  - a Hans (AVISOS_ADMIN_EMAIL o SUPERADMIN_EMAIL): un resumen con ambos.
// Solo avisa: no suspende a nadie (eso se decide en el panel de super-admin).
// Cada aviso se marca en la empresa antes de mandarlo, para no repetirlo.
import cron from "node-cron";
import empresaModel from "../models/empresa.model.js";
import { avisoPruebaPendiente, diasRestantesPrueba } from "../utils/pruebaGratis.js";
import { sendAvisoFinPruebaEmail, sendResumenPruebasAdminEmail } from "../controllers/mailController.js";

const CAMPO_AVISO = { previo: "trial.avisoPrevio", vencido: "trial.avisoVencido" };

export const revisarPruebasGratis = async (ahora = new Date()) => {
  const DIA_MS = 24 * 60 * 60 * 1000;
  const candidatas = await empresaModel
    .find({
      estadoSuscripcion: "trial",
      estado: { $ne: "inactivo" },
      "trial.fin": { $gt: new Date(ahora.getTime() - 3 * DIA_MS), $lte: new Date(ahora.getTime() + 2 * DIA_MS) },
    })
    .select("nombre slug correo telefono rubro estado estadoSuscripcion trial")
    .lean();

  const avisadas = [];
  for (const empresa of candidatas) {
    const tipo = avisoPruebaPendiente(empresa, ahora);
    if (!tipo) continue;

    // Se marca primero (atómico): dos procesos nunca mandan el mismo aviso
    const marcada = await empresaModel.findOneAndUpdate(
      { _id: empresa._id, [CAMPO_AVISO[tipo]]: null },
      { $set: { [CAMPO_AVISO[tipo]]: new Date() } },
    );
    if (!marcada) continue;

    try {
      if (empresa.correo) await sendAvisoFinPruebaEmail(empresa.correo, { empresa, tipo, fin: empresa.trial.fin });
    } catch (e) {
      console.error(`❌ Aviso fin de prueba (${empresa.slug}):`, e.message);
    }
    avisadas.push({ ...empresa, tipo, dias: diasRestantesPrueba(empresa.trial.fin, ahora) });
  }

  const correoAdmin = (process.env.AVISOS_ADMIN_EMAIL || process.env.SUPERADMIN_EMAIL || "").trim();
  if (avisadas.length && correoAdmin) {
    try {
      await sendResumenPruebasAdminEmail(correoAdmin, avisadas);
    } catch (e) {
      console.error("❌ Resumen de pruebas a super-admin:", e.message);
    }
  }
  return avisadas.length;
};

export const iniciarCronPruebaGratis = () => {
  cron.schedule(
    "17 10 * * *",
    async () => {
      try {
        const n = await revisarPruebasGratis();
        if (n) console.log(`⏳ Avisos de fin de prueba enviados: ${n}`);
      } catch (error) {
        console.error("❌ Cron fin de prueba:", error.message);
      }
    },
    { timezone: "America/Santiago" },
  );
};
