import { Router } from "express";
import { validarToken } from "../middlewares/validarToken.js";
import {
  actualizarHorasPermitidas,
  actualizarHorasPermitidasBatch,
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

router.patch(
  "/barberos/:barberoId/servicios/:servicioId/horas-permitidas",
  validarToken,
  actualizarHorasPermitidas,
);

// (Opcional pero MUY necesario para el front)
router.get("/barberos/:barberoId/servicios", obtenerServiciosDeBarbero);

router.patch(
  "/barberos/:barberoId/horas-permitidas",
  validarToken,
  actualizarHorasPermitidasBatch,
);

export default router;
