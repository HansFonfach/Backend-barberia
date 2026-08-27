import { Router } from "express";
import {
  getMiProgreso,
  crearMedicionCorporal,
  listarMisMedicionesCorporales,
  listarMedicionesClienteCorporal,
  eliminarMedicionCorporal,
  getComparativaBitacora,
} from "../controllers/progresoClienteController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarRol } from "../middlewares/verificarRol.js";
import { verificarModulo } from "../middlewares/verificarModulo.js";

const router = Router();

router.use(validarToken);

// "Mi progreso" (racha/hitos por ASISTENCIA A CLASES) solo tiene sentido
// para empresas con modulos.clasesGrupales — a diferencia de la bitácora de
// abajo, acá no se exige esAdmin (el cliente ve/edita lo suyo).
router.get("/mi-progreso", verificarModulo("clasesGrupales"), getMiProgreso);

// La bitácora de peso/medidas es igual de válida para una empresa que solo
// tiene el módulo de entrenamiento personal (sin clases agendadas) — por eso
// acepta CUALQUIERA de los dos módulos, a diferencia de "mi-progreso".
const gateBitacora = verificarModulo(["clasesGrupales", "entrenamientoPersonal"]);

router.post("/medicion-corporal", gateBitacora, crearMedicionCorporal);
router.get("/medicion-corporal/mias", gateBitacora, listarMisMedicionesCorporales);
router.get(
  "/medicion-corporal/cliente/:clienteId",
  gateBitacora,
  verificarRol("esAdmin"),
  listarMedicionesClienteCorporal,
);
router.delete("/medicion-corporal/:id", gateBitacora, eliminarMedicionCorporal);
router.get("/comparativa-bitacora", gateBitacora, getComparativaBitacora);

export default router;
