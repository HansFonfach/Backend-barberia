import { Router } from "express";
import {
  cancelarSuscripcion,
  crearSuscripcion,
  estadoSuscripcionCliente,
} from "../controllers/suscripcionController.js";

const router = Router();

// Rutas RESTful

router.post("/usuario/:id/suscribir", crearSuscripcion);
router.put("/usuario/:id/cancelarSub", cancelarSuscripcion);
router.get("/usuario/estado/:userId", estadoSuscripcionCliente)

export default router;
