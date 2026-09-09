import { Router } from "express";

import { validarToken } from "../middlewares/validarToken.js";
import {
  estadisticasProductos,
  estadisticasPorProfesional,
  estadisticasServicios,
  getDashboardResumen,
  getHoraMasSolicitada,
  getProximoCliente,
  ingresoMensual,
  ingresosPorMes,
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

router.get("/productos", validarToken, estadisticasProductos);

router.get("/ingresos/historial", validarToken, ingresosPorMes);

// Panel "Equipo" (solo admin) — resumen comparativo por profesional
router.get("/equipo", validarToken, estadisticasPorProfesional);

// Página "Servicios" — rentabilidad por servicio (ingreso, volumen,
// tendencia, evolución mensual y, si es admin, cruce por profesional).
// Visible para cualquier profesional (ve lo suyo) y para el admin
// (ve todo, o filtra a un profesional puntual con ?profesionalId=).
router.get("/servicios", validarToken, estadisticasServicios);

export default router;
