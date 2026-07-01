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
  responderConfirmacionAsistencia,
  reagendarReserva,
  actualizarReserva,
  marcarAbono,
  revertirAbono,
} from "../controllers/reservaController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { optionalAuth } from "../middlewares/optionalAuth.js";

const router = Router();

// Rutas RESTful

router.post("/", validarToken, createReserva);
router.get("/", validarToken, getReservas);
router.patch("/:id/actualizar", validarToken, actualizarReserva);
router.get("/barbero", validarToken, getReservasByBarberId);
router.get("/confirmacion/:token", responderConfirmacionAsistencia);
router.get("/:id", validarToken, getReservasByUserId);
router.patch("/:id/reagendar", validarToken, reagendarReserva);

router.get("/activas/:userId", getReservasActivas);

router.get("/barbero/por-fecha", validarToken, getReservasPorFechaBarbero);

router.delete("/:id", validarToken, postDeleteReserva);
router.patch("/:id/no-asistio", validarToken, updateMarcarNoAsistioReserva);

router.patch("/:id/marcarAbono", validarToken, marcarAbono);
router.patch("/:id/revertirAbono", validarToken, revertirAbono);

export default router;
