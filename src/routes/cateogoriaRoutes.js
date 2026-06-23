import { Router } from "express";

import { validarToken } from "../middlewares/validarToken.js";
import { verificarRol } from "../middlewares/verificarRol.js";
import {
  crearCategoria,
  listarCategorias,
} from "../controllers/categoriaController.js";

const router = Router();

router.get(`/:slug/categorias`, listarCategorias);
router.post(
  "/crearCategoria",
  validarToken,
  verificarRol("esAdmin"),
  crearCategoria,
);


export default router;
