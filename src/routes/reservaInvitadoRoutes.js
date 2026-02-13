// routes/reservaInvitadoRoutes.js
import { Router } from "express";
import { reservarComoInvitado } from "../controllers/reservaInvitadoController.js";

const router = Router();

// Crear reserva como invitado
router.post("/:slug", reservarComoInvitado);


export default router;
