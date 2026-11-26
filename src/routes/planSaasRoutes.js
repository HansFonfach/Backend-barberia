import { Router } from "express";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarRol } from "../middlewares/verificarRol.js";
import { limitarEscrituraPublica, limitarLecturaPublica } from "../middlewares/publicRateLimiter.js";
import {
  activarAutomatico,
  cancelarAutomatico,
  miPlan,
  pagarMes,
  verPlan,
  verificarAutomatico,
  verificarPago,
} from "../controllers/planSaasController.js";

// Mensualidad de AgendaFonfach con Mercado Pago (ver planSaasController.js)
const router = Router();

router.get("/mi-plan", validarToken, verificarRol(), miPlan);

router.get("/link/:token", limitarLecturaPublica, verPlan);
router.post("/link/:token/pagar", limitarEscrituraPublica, pagarMes);
router.post("/link/:token/verificar", limitarLecturaPublica, verificarPago);
router.post("/link/:token/automatico", limitarEscrituraPublica, activarAutomatico);
router.post("/link/:token/automatico/verificar", limitarLecturaPublica, verificarAutomatico);
router.post("/link/:token/automatico/cancelar", limitarEscrituraPublica, cancelarAutomatico);

export default router;
