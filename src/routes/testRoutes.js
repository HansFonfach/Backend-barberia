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
import clienteServicioStatsModel from "../models/clienteServicioStats.model.js";



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



export default router;
