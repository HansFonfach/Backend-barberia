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
import { registroPublicoEmpresa } from "../controllers/registroPublicoEmpresa.js";

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
router.get("/publicas", getEmpresasPublicas);
router.put(
  "/:empresaId/logo",
  validarToken,
  verificarRol("esAdmin"),
  upload.single("logo"),
  actualizarLogoEmpresa,
); // ← antes de /:id
router.get("/:id", validarToken, getEmpresaPorId);
router.patch(
  "/actualizar",
  validarToken,
  verificarRol("esAdmin"),
  actualizarEmpresa,
);

export default router;
