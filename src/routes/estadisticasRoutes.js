import { Router } from "express";

import { validarToken } from "../middlewares/validarToken.js";
import {
  citasEsteMes,
  ingresoMensual,
  proximaReserva,
  totalClientes,
  totalReservasHoyBarbero,
  totalSuscripcionesActivas,
  ultimaReserva,
} from "../controllers/estadisticasController.js";
("../controllers/excepcionHorarioController.js");

const router = Router();

// Rutas RESTful

router.get(
  "/reservasHoyBarbero/:userId",
  validarToken,
  totalReservasHoyBarbero
);
router.get("/suscripcionesActivas", validarToken, totalSuscripcionesActivas);
router.get("/totalClientes", validarToken, totalClientes);
router.get("/ingresoMensual", validarToken, ingresoMensual);
router.get("/citasMes/:userId", validarToken, citasEsteMes);
router.get("/ultima-reserva/:userId", validarToken, ultimaReserva)
router.get("/proxima-reserva/:userId", validarToken, proximaReserva)

export default router;
