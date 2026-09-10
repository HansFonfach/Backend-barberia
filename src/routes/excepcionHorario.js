import { Router } from "express";
import { validarToken } from "../middlewares/validarToken.js";
import {
  toggleHora, // ← Nueva función unificada
  agregarHoraExtra,
  actualizarHoraExtra,
  eliminarHoraExtra, // ← Renombrada
  obtenerExcepcionesPorDia,
  toggleTrabajoFeriado, // 👈 nuevo
  obtenerFeriadosConEstado, // 👈 nuevo
  configurarTrabajoFeriado, // 👈 panel de equipo (admin)
  quitarTrabajoFeriado, // 👈 panel de equipo (admin)
} from "../controllers/excepcionHorarioController.js";

const router = Router();

// Rutas RESTful actualizadas

// Ruta única para toggle (cancelar/reactivar) - REEMPLAZA A cancelarHora y revertirHora
router.post("/toggle", validarToken, toggleHora);

// Ruta para agregar hora extra (se mantiene igual)
router.post("/agregar-hora-extra", validarToken, agregarHoraExtra);

// Ruta para actualizar (corregir) la duración de una hora extra ya creada
router.post("/actualizar-hora-extra", validarToken, actualizarHoraExtra);

// Ruta para eliminar hora extra (renombrada de cancelar-hora-extra)
router.post("/eliminar-hora-extra", validarToken, eliminarHoraExtra);

// 👇 nuevas, ANTES de la genérica
router.post("/feriado/toggle", validarToken, toggleTrabajoFeriado);
router.get("/feriado/:barberoId", validarToken, obtenerFeriadosConEstado);

// Panel de equipo (admin): detalle por profesional de un feriado —
// horario propio, servicios disponibles y precio especial, todo opcional.
router.post("/feriado/configurar", validarToken, configurarTrabajoFeriado);
router.post("/feriado/quitar", validarToken, quitarTrabajoFeriado);

// Ruta para obtener excepciones por día (se mantiene igual)
router.get("/:barberoId", validarToken, obtenerExcepcionesPorDia);

export default router;
