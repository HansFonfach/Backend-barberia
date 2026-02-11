// routes/reservaInvitadoRoutes.js
import { Router } from "express";
import { 
    cancelarReservaInvitado,
  createReservaInvitado,
  getReservasInvitado, 

} from "../controllers/reservaInvitadoController.js";

const router = Router();

// Crear reserva como invitado
router.post("/", createReservaInvitado);

router.get("/invitado", getReservasInvitado);
router.patch("/invitado/:id/cancelar", cancelarReservaInvitado);

export default router;
