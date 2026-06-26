import { Router } from "express";
import RecordatoriosJob from "../jobs/recordatoriosJob.js";
import retencionCron from "../cron/recordatoriosVolver.js"; // 👈 agrega este
import { validarToken } from "../middlewares/validarToken.js";
import {
  calcularBeneficioSuscripcion,
  generarMotivo,
  obtenerClientesCandidatosSuscripcion,
  obtenerClientesUnaVisitaNoRetornan,
  obtenerEstadoLookCliente,
  recomendarPlan,
} from "../controllers/clienteAnalyticsController.js";
import reservaModel from "../models/reserva.model.js";
import recordatoriosJob from "../jobs/recordatoriosJob.js";
import recordatorioPagoCron from "../cron/recordatoriosPagoCron.js";
import { sendRecomendacionSuscripcionEmail } from "../controllers/mailController.js";
import usuarioModel from "../models/usuario.model.js";
import { calcularPromedioDias } from "../helpers/calcularPromedios.js";
import servicioModel from "../models/servicio.model.js";
import { PLANES, IDS_SERVICIOS_SUSCRIPCION } from "../config/planes.js";


const esCorte = (n = "") => n.toLowerCase().includes("corte");
const esBarba = (n = "") => n.toLowerCase().includes("barba");
const esCombo = (n = "") => esCorte(n) && esBarba(n);

const router = Router();

router.get(
  "/recordatorios-inteligentes",
  validarToken,
  obtenerEstadoLookCliente,
);

router.get(
  "/recordatorios-inteligentes/no-retornan",

  obtenerClientesUnaVisitaNoRetornan,
);

router.get(
  "/recordatorios-inteligentes/candidatos-suscripcion",

  obtenerClientesCandidatosSuscripcion,
);

router.get("/test-mail", async (req, res) => {
  try {
    const empresaId = "698de476677550fcd3d2209c";
    const tuEmail = "hans.fonfach22@gmail.com";

    // Buscar tu usuario
    const cliente = await usuarioModel.findOne({ email: tuEmail });
    if (!cliente)
      return res
        .status(404)
        .json({ ok: false, message: "Usuario no encontrado" });

    // Obtener reservas tuyas
    const reservas = await reservaModel
      .find({ empresa: empresaId, cliente: cliente._id })
      .populate("servicio", "nombre")
      .sort({ fecha: 1 });

    const reservasValidas = reservas.filter((r) =>
      ["completada", "terminada", "finalizada"].includes(
        (r.estado || "").toLowerCase(),
      ),
    );

    if (reservasValidas.length < 3) {
      return res.json({
        ok: false,
        message: "No hay suficientes reservas para calcular",
      });
    }

    // Calcular perfil
    const fechas = reservasValidas.map((r) => new Date(r.fecha));
    const promedioDias = calcularPromedioDias(fechas);
    const total = reservasValidas.length;

    let cortes = 0,
      barbas = 0,
      combos = 0;
    for (const r of reservasValidas) {
      const nombre = r.servicio?.nombre || "";
      if (esCombo(nombre)) combos++;
      else if (esBarba(nombre)) barbas++;
      else if (esCorte(nombre)) cortes++;
    }

    const perfil = {
      pctCorte: cortes / total,
      pctBarba: barbas / total,
      pctCombo: combos / total,
      frecuenciaDias: promedioDias,
    };

    // Precios reales desde la BD
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

    const suscripcionSugerida = recomendarPlan(perfil);
    const plan = PLANES[suscripcionSugerida];
    const motivo = generarMotivo(suscripcionSugerida);
    const visitasMensuales = Math.round(30 / promedioDias);
    const beneficio = calcularBeneficioSuscripcion(
      suscripcionSugerida,
      visitasMensuales,
      perfil,
      PRECIOS,
    );

    await sendRecomendacionSuscripcionEmail(tuEmail, {
      nombreCliente: cliente.nombre,
      nombreEmpresa: "La Santa Barbería",
      suscripcionSugerida,
      nombrePlan: plan.descripcion,
      precioPlan: plan.precio,
      motivo,
      ...beneficio,
    });

    return res.json({
      ok: true,
      debug: {
        promedioDias,
        visitasMensuales,
        perfil,
        suscripcionSugerida,
        beneficio,
        PRECIOS,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false });
  }
});

export default router;
