import { Router } from "express";

import { validarToken } from "../middlewares/validarToken.js";
import {

  getDashboardResumen,
  getHoraMasSolicitada,
  getProximoCliente,

  ingresoMensual,
  ingresoTotal,
  proximaReserva,

  totalReservasHoyBarbero,
  totalSuscripcionesActivas,
  ultimaReserva,
} from "../controllers/estadisticasController.js";
("../controllers/excepcionHorarioController.js");

const router = Router();

// Rutas RESTful

router.get("/reservasHoyBarbero", validarToken, totalReservasHoyBarbero);
router.get("/suscripcionesActivas", validarToken, totalSuscripcionesActivas);
router.get("/ultima-reserva", validarToken, ultimaReserva);
router.get("/proxima-reserva", validarToken, proximaReserva);
router.get("/proximo-cliente", validarToken, getProximoCliente);

router.get("/ingresoMensual", validarToken, ingresoMensual);

router.get("/horaMasSolicitada", validarToken, getHoraMasSolicitada);

router.get("/ingreso-total", validarToken, ingresoTotal);

router.get("/dashboard/resumen", validarToken, getDashboardResumen);

export default router;
