import { Router } from "express";
import {
  actualizarEmpresa,
  actualizarLogoEmpresa,
  getEmpresaPorId,
  getEmpresaPorSlug,
  ingresarEmpresa,
} from "../controllers/empresaController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { upload } from "../middlewares/upload.js";

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
router.get("/:id", validarToken, getEmpresaPorId);
router.patch("/actualizar", validarToken, actualizarEmpresa);
router.put("/:empresaId/logo", actualizarLogoEmpresa);

export default router;
