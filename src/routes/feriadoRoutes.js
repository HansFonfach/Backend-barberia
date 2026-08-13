import { Router } from "express";
import {
  getFeriados,
  toggleFeriado,
  cargarFeriadosChile,
  cambiarComportamientoFeriado, // NUEVO
  verificarFeriado, // NUEVO
} from "../controllers/feriadoController.js";
import { validarToken } from "../middlewares/validarToken.js";

const router = Router();

router.get("/verificar", verificarFeriado); // pública, se queda así

router.get("/", validarToken, getFeriados);
router.patch("/:id/toggle", validarToken, toggleFeriado);
router.patch("/:id/comportamiento", validarToken, cambiarComportamientoFeriado);
router.post("/cargar-chile", validarToken, cargarFeriadosChile);

export default router;
