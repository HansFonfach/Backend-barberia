import { Router } from "express";
import { getFeriados, toggleFeriado, cargarFeriadosChile } from "../controllers/feriadoController.js";

const router = Router();

router.get("/", getFeriados);
router.patch("/:id/toggle", toggleFeriado);

// ⚠ Ejecutar SOLO manualmente 1 vez al año
router.post("/cargar-chile", cargarFeriadosChile);

export default router;