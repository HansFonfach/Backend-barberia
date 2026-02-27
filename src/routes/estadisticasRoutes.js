import { Router } from "express";

import { validarToken } from "../middlewares/validarToken.js";
import {
  citasEsteMes,
  getHoraMasSolicitada,
  getProximoCliente,
  getTop5Clientes,
  horaMasCancelada,
  ingresoMensual,
  ingresoTotal,
  proximaReserva,
  reservasCanceladas,
  reservasCompletadas,
  reservasNoAsistidas,
  servicioMasPopular,
  tasaDeAsistencia,
  tasaDeCancelacion,
  totalClientes,
  totalReservasHoyBarbero,
  totalSuscripcionesActivas,
  ultimaReserva,
} from "../controllers/estadisticasController.js";
import { validateRequest } from "twilio/lib/webhooks/webhooks.js";
("../controllers/excepcionHorarioController.js");

const router = Router();

// Rutas RESTful

router.get(
  "/reservasHoyBarbero/:userId",
  validarToken,
  totalReservasHoyBarbero,
);
router.get("/suscripcionesActivas", validarToken, totalSuscripcionesActivas);
router.get("/totalClientes", validarToken, totalClientes);
router.get("/ingresoMensual", validarToken, ingresoMensual);
router.get("/citasMes/:userId", validarToken, citasEsteMes);
router.get("/ultima-reserva/:userId", validarToken, ultimaReserva);
router.get("/proxima-reserva/", validarToken, proximaReserva);
router.get("/top5-clientes", validarToken, getTop5Clientes);
router.get("/horaMasSolicitada", validarToken, getHoraMasSolicitada);
router.get("/proximo-cliente", validarToken, getProximoCliente);
router.get("/ingresoTotal", validarToken, ingresoTotal);
router.get("/reservas-completadas", validarToken, reservasCompletadas);
router.get("/reservas-canceladas", validarToken, reservasCanceladas);
router.get("/reservas-no-asistidas", validarToken, reservasNoAsistidas);
router.get("/hora-mas-cancelada", validarToken, horaMasCancelada);
router.get("/servicio-mas-popular", validarToken, servicioMasPopular);
router.get("/tasa-de-cancelacion", validarToken, tasaDeCancelacion);
router.get("/tasa-de-asistencia", validarToken, tasaDeAsistencia);

export default router;
