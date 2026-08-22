import { Router } from "express";
import {
  getPlanesPublicos,
  crearPlan,
  listarPlanes,
  actualizarPlan,
  toggleActivoPlan,
  eliminarPlan,
} from "../controllers/planMembresiaClaseController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarRol } from "../middlewares/verificarRol.js";
import { verificarModulo } from "../middlewares/verificarModulo.js";

const router = Router();

// Catálogo público para el landing (sin login) — va ANTES del validarToken
// de abajo a propósito, mismo patrón que /clases/:slug/publicas.
router.get("/:slug/publicas", getPlanesPublicos);

// Mismo resguardo que el resto del módulo: solo empresas con clasesGrupales activo.
router.use(validarToken, verificarModulo("clasesGrupales"));

router.get("/", listarPlanes);
router.post("/", verificarRol("esAdmin"), crearPlan);
router.put("/:id", verificarRol("esAdmin"), actualizarPlan);
router.patch("/:id/toggle-activo", verificarRol("esAdmin"), toggleActivoPlan);
router.delete("/:id", verificarRol("esAdmin"), eliminarPlan);

export default router;
