import { Router } from "express";
import {
  createReserva,
  getReservasByUserId,
  getReservas,
  postDeleteReserva,
  getReservasByBarberId,
  getReservasActivas,
  getReservasPorFechaBarbero,
} from "../controllers/reservaController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { optionalAuth } from "../middlewares/optionalAuth.js";

const router = Router();

// Rutas RESTful

router.post("/", optionalAuth, createReserva);
router.get("/", validarToken, getReservas);
router.get("/barbero", validarToken, getReservasByBarberId);
router.get("/:id", validarToken, getReservasByUserId);
router.get("/activas/:userId", getReservasActivas);

router.get("/barbero/por-fecha", validarToken, getReservasPorFechaBarbero);

router.delete("/:id", postDeleteReserva);

export default router;
