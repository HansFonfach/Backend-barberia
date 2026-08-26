import { Router } from "express";
import {
  getIngresosGimnasio,
  getMembresiasGimnasio,
  getClasesHoyGimnasio,
  getClientesGimnasio,
  getPorCobrarGimnasio,
  getResumenPeriodoGimnasio,
  getClientesAnalisisGimnasio,
  getDemandaGimnasio,
  getEvolucionGimnasio,
} from "../controllers/estadisticasGimnasioController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarRol } from "../middlewares/verificarRol.js";
import { verificarModulo } from "../middlewares/verificarModulo.js";

const router = Router();

// Dashboard de gimnasios/boxes: solo empresas con modulos.clasesGrupales
// activo, y solo el admin (son datos de negocio, no de un cliente puntual).
router.use(validarToken, verificarModulo("clasesGrupales"), verificarRol("esAdmin"));

router.get("/ingresos", getIngresosGimnasio);
router.get("/membresias", getMembresiasGimnasio);
router.get("/clases-hoy", getClasesHoyGimnasio);
router.get("/clientes", getClientesGimnasio);
router.get("/por-cobrar", getPorCobrarGimnasio);

// Panel de estadísticas completo (selector de período + comparación)
router.get("/resumen", getResumenPeriodoGimnasio);
router.get("/clientes-analisis", getClientesAnalisisGimnasio);
router.get("/demanda", getDemandaGimnasio);
router.get("/evolucion", getEvolucionGimnasio);

export default router;
