import { Router } from "express";
import {
  crearPlanSuscripcion,
  listarPlanesSuscripcion,
  actualizarPlanSuscripcion,
  toggleActivoPlanSuscripcion,
  eliminarPlanSuscripcion,
  listarPlanesPublicos,
} from "../controllers/planSuscripcionController.js";
import { limitarLecturaPublica } from "../middlewares/publicRateLimiter.js";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarRol } from "../middlewares/verificarRol.js";

const router = Router();

// Público (página del negocio): va antes de exigir sesión
router.get("/publico/:slug", limitarLecturaPublica, listarPlanesPublicos);

router.use(validarToken);

router.get("/", listarPlanesSuscripcion);
router.post("/", verificarRol("esAdmin"), crearPlanSuscripcion);
router.put("/:id", verificarRol("esAdmin"), actualizarPlanSuscripcion);
router.patch(
  "/:id/toggle-activo",
  verificarRol("esAdmin"),
  toggleActivoPlanSuscripcion,
);
router.delete("/:id", verificarRol("esAdmin"), eliminarPlanSuscripcion);

export default router;
