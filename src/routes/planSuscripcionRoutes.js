import { Router } from "express";
import {
  crearPlanSuscripcion,
  listarPlanesSuscripcion,
  actualizarPlanSuscripcion,
  toggleActivoPlanSuscripcion,
  eliminarPlanSuscripcion,
} from "../controllers/planSuscripcionController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarRol } from "../middlewares/verificarRol.js";

const router = Router();

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
