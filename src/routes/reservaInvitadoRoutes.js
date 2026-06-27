import { Router } from "express";
import {
  cancelarReservaPorLink,
  getReservaInfoPorToken,
  reservarComoInvitado,
} from "../controllers/reservaInvitadoController.js";
import {
  obtenerDatosSlot,
  confirmarSlotDesdeToken,
} from "../controllers/confirmarSlotController.js";

const router = Router();

// Rutas fijas primero
router.post("/cancelar-reserva-invitado", cancelarReservaPorLink);
router.get("/info-por-token", getReservaInfoPorToken);

// ✅ Confirmar slot desde correo de recordatorio
router.get("/confirmar-slot", obtenerDatosSlot);
router.post("/confirmar-slot", confirmarSlotDesdeToken);

// Al final la dinámica
router.post("/:slug", reservarComoInvitado);

export default router;
