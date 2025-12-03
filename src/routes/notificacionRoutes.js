import { Router } from "express";

import { validarToken } from "../middlewares/validarToken.js";
import { crearNotificacion } from "../controllers/notificacionController.js";

const router = Router();

// Rutas RESTful

router.post("/crearNotificacion", validarToken, crearNotificacion); // Crear nuevo


export default router;
  