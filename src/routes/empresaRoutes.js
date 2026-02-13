import { Router } from "express";
import {
    getEmpresaPorId,
  getEmpresaPorSlug,
  ingresarEmpresa,
} from "../controllers/empresaController.js";
import { validarToken } from "../middlewares/validarToken.js";

const router = Router();

router.post("/ingresarEmpresa", validarToken, ingresarEmpresa); // Crear nuevo
router.get("/slug/:slug", getEmpresaPorSlug);
router.get("/:id", validarToken, getEmpresaPorId);

export default router;
