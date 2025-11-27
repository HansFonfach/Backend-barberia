import { Router } from "express";
import {
  createHorario,
  getHorariosByBarbero,
  getHorasDisponibles,
} from "../controllers/horarioController.js";
import { validarToken } from "../middlewares/validarToken.js";

const router = Router();

// Rutas RESTful

router.post("/", validarToken, createHorario); // Crear nuevo
router.get("/:id/horarios-disponibles", validarToken, getHorasDisponibles);
router.get("/barbero/:barberoId", validarToken, getHorariosByBarbero)

export default router;
