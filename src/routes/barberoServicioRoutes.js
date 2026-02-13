import { Router } from "express";
import { validarToken } from "../middlewares/validarToken.js";
import {
  asignarServiciosBarbero,
  obtenerServiciosDeBarbero,
} from "../controllers/barberoServicioController.js";

const router = Router();

// Asignar o actualizar servicio a un barbero
router.post(
  "/barberos/:barberoId/servicios",
  validarToken,
  asignarServiciosBarbero,
);

// (Opcional pero MUY necesario para el front)
router.get("/barberos/:barberoId/servicios", obtenerServiciosDeBarbero);

export default router;
