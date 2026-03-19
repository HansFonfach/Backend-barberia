import { Router } from "express";
import { validarToken } from "../middlewares/validarToken.js";
import { crearNotificacion } from "../controllers/notificacionController.js";

const router = Router();

// Middleware condicional: si es invitado no requiere token
const validarTokenOpcional = (req, res, next) => {
  if (req.body.esInvitado) return next();
  return validarToken(req, res, next);
};

router.post("/crearNotificacion", validarTokenOpcional, crearNotificacion);

export default router;