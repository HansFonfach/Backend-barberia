import { Router } from "express";
import {
  createReserva,
  getReservasByUserId,
  getReservas,
  postDeleteReserva,
  getReservasByBarberId,
  getReservasActivas,
  getReservasPorFechaBarbero,
  updateMarcarNoAsistioReserva,
} from "../controllers/reservaController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { optionalAuth } from "../middlewares/optionalAuth.js";

const router = Router();

// Rutas RESTful

router.post("/", validarToken, createReserva);
router.get("/", validarToken, getReservas);
router.get("/barbero", validarToken, getReservasByBarberId);
router.get("/:id", validarToken, getReservasByUserId);
router.get("/activas/:userId", getReservasActivas);


router.get("/barbero/por-fecha", validarToken, getReservasPorFechaBarbero);

router.delete("/:id", validarToken,  postDeleteReserva);
router.patch("/:id/no-asistio", validarToken, updateMarcarNoAsistioReserva)

export default router;
