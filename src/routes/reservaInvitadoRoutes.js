import { Router } from "express";
import {
  cancelarReservaPorLink,
  getReservaInfoPorToken,
  reservarComoInvitado,
} from "../controllers/reservaInvitadoController.js";

const router = Router();

router.post("/:slug", reservarComoInvitado);
router.post("/cancelar-reserva-invitado", cancelarReservaPorLink);
router.get("/info-por-token", getReservaInfoPorToken);

export default router;