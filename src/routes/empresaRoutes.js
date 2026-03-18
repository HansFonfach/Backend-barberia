import { Router } from "express";
import {
  actualizarEmpresa,
  actualizarLogoEmpresa,
  getEmpresaPorId,
  getEmpresaPorSlug,
  getEmpresasPublicas,
  ingresarEmpresa,
} from "../controllers/empresaController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { upload } from "../middlewares/upload.js";
import { verificarRol } from "../middlewares/verificarRol.js";

const router = Router();

router.post(
  "/empresa",
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "banner", maxCount: 1 },
  ]),
  ingresarEmpresa,
);
router.get("/slug/:slug", getEmpresaPorSlug);
router.get("/publicas", getEmpresasPublicas); // sin middleware de auth
router.get("/:id", validarToken, getEmpresaPorId);
router.patch("/actualizar", validarToken, verificarRol("esAdmin"),  actualizarEmpresa);
router.put("/:empresaId/logo", verificarRol("esAdmin"), actualizarLogoEmpresa);


export default router;
