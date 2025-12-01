import { Router } from "express";
import {
  getFeriados,
  toggleFeriado,
  cargarFeriadosChile,
  cambiarComportamientoFeriado, // NUEVO
  verificarFeriado, // NUEVO
} from "../controllers/feriadoController.js";

const router = Router();

// Ruta pública para verificar feriado (para frontend)
router.get("/verificar", verificarFeriado);

// Rutas protegidas (solo barberos/admins)
router.get("/", getFeriados);
router.patch("/:id/toggle", toggleFeriado);
router.patch("/:id/comportamiento", cambiarComportamientoFeriado); // NUEVO

// ⚠ Ejecutar SOLO manualmente 1 vez al año
router.post("/cargar-chile", cargarFeriadosChile);

export default router;
