import { Router } from "express";
import {
  cancelarReservaPorLink,
  getReservaInfoPorToken,
  reservarComoInvitado,
} from "../controllers/reservaInvitadoController.js";

const router = Router();

// 👇 Primero las rutas fijas
router.post("/cancelar-reserva-invitado", cancelarReservaPorLink);
router.get("/info-por-token", getReservaInfoPorToken);

// 👇 Al final la dinámica
router.post("/:slug", reservarComoInvitado);

export default router;