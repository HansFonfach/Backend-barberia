import { Router } from "express";

import { validarToken } from "../middlewares/validarToken.js";
import {
  citasEsteMes,
  getHoraMasSolicitada,
  getProximoCliente,
  getTop5Clientes,
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
router.get("/proxima-reserva/", validarToken, proximaReserva)
router.get("/top5-clientes", validarToken, getTop5Clientes)
router.get("/horaMasSolicitada", validarToken, getHoraMasSolicitada)
router.get("/proximo-cliente", validarToken, getProximoCliente)

export default router;
