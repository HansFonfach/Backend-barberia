import { Router } from "express";

import { validarToken } from "../middlewares/validarToken.js";
import { ingresoMensual, totalClientes, totalReservasHoyBarbero, totalSuscripcionesActivas } from "../controllers/estadisticasController.js";
 "../controllers/excepcionHorarioController.js";

const router = Router();

// Rutas RESTful

router.get("/reservasHoyBarbero/:userId", validarToken, totalReservasHoyBarbero); 
router.get("/suscripcionesActivas", validarToken, totalSuscripcionesActivas); 
router.get("/totalClientes", validarToken, totalClientes); 
router.get("/ingresoMensual", validarToken, ingresoMensual); 


export default router;
