import { Router } from "express";
import {
  cancelarSuscripcion,
  crearSuscripcion,
  estadoSuscripcionCliente,
  getSuscripcionActiva,
  registrarUsoServicio,
} from "../controllers/suscripcionController.js";
import { validarToken } from "../middlewares/validarToken.js";

const router = Router();

// Rutas RESTful

router.post("/usuario/:id/suscribir", validarToken, crearSuscripcion);
router.put("/usuario/:id/cancelarSub",  validarToken  , cancelarSuscripcion);
router.get("/usuario/estado/:userId", validarToken, estadoSuscripcionCliente);
router.get("/usuario/activa", validarToken,  getSuscripcionActiva);
router.post("/usuario/usar-servicio", validarToken, registrarUsoServicio);

export default router;
