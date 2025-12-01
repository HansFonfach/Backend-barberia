import { Router } from "express";
import { 
  getFeriados, 
  toggleFeriado, 
  cargarFeriadosChile,
  cambiarComportamientoFeriado,  // NUEVO
  verificarFeriado               // NUEVO
} from "../controllers/feriadoController.js";
import { autenticar } from "../middlewares/auth.middleware.js";

const router = Router();

// Ruta pública para verificar feriado (para frontend)
router.get("/verificar", verificarFeriado);

// Rutas protegidas (solo barberos/admins)
router.get("/", autenticar, getFeriados);
router.patch("/:id/toggle", autenticar, toggleFeriado);
router.patch("/:id/comportamiento", autenticar, cambiarComportamientoFeriado); // NUEVO

// ⚠ Ejecutar SOLO manualmente 1 vez al año
router.post("/cargar-chile", autenticar, cargarFeriadosChile);

export default router;