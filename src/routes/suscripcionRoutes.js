import { Router } from "express";
import {
  cancelarSuscripcion,
  crearSuscripcion,
} from "../controllers/suscripcionController.js";

const router = Router();

// Rutas RESTful

router.post("/usuario/:id/suscribir", crearSuscripcion);
router.put("/usuario/:id/cancelarSub", cancelarSuscripcion);

export default router;
