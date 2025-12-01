import { Router } from "express";
import { validarToken } from "../middlewares/validarToken.js";
import {
  toggleHora, // ← Nueva función unificada
  agregarHoraExtra,
  eliminarHoraExtra, // ← Renombrada
  obtenerExcepcionesPorDia,
  // revertirHora,  // ← Ya no se usa
  // cancelarHora,  // ← Ya no se usa
  // cancelarHoraExtra,  // ← Renombrada
} from "../controllers/excepcionHorarioController.js";

const router = Router();

// Rutas RESTful actualizadas

// Ruta única para toggle (cancelar/reactivar) - REEMPLAZA A cancelarHora y revertirHora
router.post("/toggle", validarToken, toggleHora);

// Ruta para agregar hora extra (se mantiene igual)
router.post("/agregar-hora-extra", validarToken, agregarHoraExtra);

// Ruta para eliminar hora extra (renombrada de cancelar-hora-extra)
router.post("/eliminar-hora-extra", validarToken, eliminarHoraExtra);

// Ruta para obtener excepciones por día (se mantiene igual)
router.get("/:barberoId", validarToken, obtenerExcepcionesPorDia);

export default router;
