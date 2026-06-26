import cron from "node-cron";
import reservaModel from "../models/reserva.model.js";
import usuarioModel from "../models/usuario.model.js";
import servicioModel from "../models/servicio.model.js";
import { sendRecomendacionSuscripcionEmail } from "../controllers/mailController.js";
import { PLANES, IDS_SERVICIOS_SUSCRIPCION } from "../config/planes.js";
import { calcularPromedioDias } from "../helpers/calcularPromedios.js";

const normalizarFecha = (fecha) => {
  const f = new Date(fecha);
  f.setHours(0, 0, 0, 0);
  return f;
};

const esCorte = (n = "") => n.toLowerCase().includes("corte");
const esBarba = (n = "") => n.toLowerCase().includes("barba");
const esCombo = (n = "") => esCorte(n) && esBarba(n);

const recomendarPlan = (perfil) => {
  const { pctCorte, pctBarba, pctCombo, frecuenciaDias } = perfil;

  if (pctCombo >= 0.4 || (pctCorte > 0.4 && pctBarba > 0.4)) {
    return "combo_visita_corte_barba";
  }

  if (pctBarba >= 0.5 && frecuenciaDias <= 14) {
    return "barba";
  }

  return "creditos";
};

const generarMotivo = (plan) => {
  switch (plan) {
    case "combo_visita_corte_barba":
      return "Vienes frecuentemente a corte y barba, por lo que el plan combo te entrega mejor ahorro.";
    case "barba":
      return "Tu historial muestra visitas frecuentes de barba, lo que hace conveniente un plan semanal.";
    case "creditos":
      return "Tu patrón de visitas es principalmente de corte de pelo con buena recurrencia.";
    default:
      return "";
  }
};

const calcularBeneficio = (planKey, visitasMensuales, perfil, PRECIOS) => {
  const plan = PLANES[planKey];

  const valorSinPlan =
    perfil.pctCombo > 0.4
      ? visitasMensuales * PRECIOS.combo
      : perfil.pctBarba > perfil.pctCorte
        ? visitasMensuales * PRECIOS.barba
        : visitasMensuales * PRECIOS.corte;

  const ahorroMensual = Math.max(valorSinPlan - plan.precio, 0);
  const ahorroAnual = ahorroMensual * 12;
  const equivalenteCortes = Math.round(ahorroAnual / PRECIOS.corte);

  return { ahorroMensual, ahorroAnual, equivalenteCortes };
};

export const iniciarCronSuscripcionesMensual = () => {
  // Corre todos los días a las 9am — la lógica de 45 días controla la frecuencia
  cron.schedule("0 9 * * *", async () => {
    console.log("📩 Revisando candidatos a suscripción...");

    try {
      const empresaId = "698de476677550fcd3d2209c";
      await procesarEmpresa(empresaId);
      console.log("✔ Revisión finalizada");
    } catch (error) {
      console.error("❌ Error en cron de suscripciones:", error);
    }
  });
};

const procesarEmpresa = async (empresaId) => {
  // ✅ Precios reales desde la BD
  const serviciosDB = await servicioModel.find(
    { _id: { $in: Object.values(IDS_SERVICIOS_SUSCRIPCION) } },
    "nombre precio",
  );

  const PRECIOS = {
    corte:
      serviciosDB.find(
        (s) => s._id.toString() === IDS_SERVICIOS_SUSCRIPCION.corte,
      )?.precio || 0,
    barba:
      serviciosDB.find(
        (s) => s._id.toString() === IDS_SERVICIOS_SUSCRIPCION.barba,
      )?.precio || 0,
    combo:
      serviciosDB.find(
        (s) => s._id.toString() === IDS_SERVICIOS_SUSCRIPCION.combo,
      )?.precio || 0,
  };

  const reservas = await reservaModel
    .find({ empresa: empresaId })
    .populate(
      "cliente",
      "nombre apellido email telefono suscrito intentosEmailSuscripcion ultimoEmailSuscripcion",
    )
    .populate("servicio", "nombre")
    .sort({ fecha: 1 });

  const reservasValidas = reservas.filter((r) =>
    ["terminada", "finalizada", "completada"].includes(
      (r.estado || "").toLowerCase(),
    ),
  );

  const clientesMap = new Map();

  for (const r of reservasValidas) {
    const c = r.cliente;
    if (!c?._id) continue;

    const id = c._id.toString();

    if (!clientesMap.has(id)) {
      clientesMap.set(id, {
        cliente: c,
        fechas: [],
        cortes: 0,
        barbas: 0,
        combos: 0,
      });
    }

    const item = clientesMap.get(id);
    item.fechas.push(normalizarFecha(r.fecha));

    const nombre = r.servicio?.nombre || "";

    if (esCombo(nombre)) item.combos++;
    else if (esBarba(nombre)) item.barbas++;
    else if (esCorte(nombre)) item.cortes++;
  }

  let enviados = 0;
  let omitidos = 0;

  for (const data of clientesMap.values()) {
    const { cliente, fechas, cortes, barbas, combos } = data;

    if (!cliente?.email) continue;
    if (cliente.suscrito) continue;
    if (fechas.length < 3) continue;

    // ✅ Máximo 3 intentos
    if ((cliente.intentosEmailSuscripcion || 0) >= 3) {
      omitidos++;
      continue;
    }

    // ✅ Respetar intervalo de 45 días
    if (cliente.ultimoEmailSuscripcion) {
      const diasDesdeUltimo = Math.floor(
        (Date.now() - new Date(cliente.ultimoEmailSuscripcion)) /
          (1000 * 60 * 60 * 24),
      );
      if (diasDesdeUltimo < 45) {
        omitidos++;
        continue;
      }
    }

    const promedioDias = calcularPromedioDias(fechas);

    if (promedioDias < 10 || promedioDias > 21) continue;

    const total = fechas.length;

    const perfil = {
      pctCorte: cortes / total,
      pctBarba: barbas / total,
      pctCombo: combos / total,
      frecuenciaDias: promedioDias,
    };

    const suscripcionSugerida = recomendarPlan(perfil);
    const plan = PLANES[suscripcionSugerida];
    const motivo = generarMotivo(suscripcionSugerida);
    const visitasMensuales = Math.round(30 / promedioDias);
    const beneficio = calcularBeneficio(
      suscripcionSugerida,
      visitasMensuales,
      perfil,
      PRECIOS,
    );

    try {
      await sendRecomendacionSuscripcionEmail(cliente.email, {
        nombreCliente: cliente.nombre,
        nombreEmpresa: "La Santa Barbería",
        suscripcionSugerida,
        nombrePlan: plan.descripcion,
        precioPlan: plan.precio,
        motivo,
        ahorroMensual: beneficio.ahorroMensual,
        ahorroAnual: beneficio.ahorroAnual,
        equivalenteCortes: beneficio.equivalenteCortes,
      });

      await usuarioModel.findByIdAndUpdate(cliente._id, {
        $inc: { intentosEmailSuscripcion: 1 },
        $set: { ultimoEmailSuscripcion: new Date() },
      });

      enviados++;
      console.log(`✅ Email enviado a ${cliente.email}`);
    } catch (err) {
      console.error(`❌ Error enviando a ${cliente.email}:`, err.message);
    }
  }

  console.log(
    `Empresa ${empresaId} → enviados: ${enviados}, omitidos: ${omitidos}`,
  );
};
