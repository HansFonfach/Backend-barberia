// routes/reservaInvitadoRoutes.js
import { Router } from "express";
import {
  cancelarReservaPorLink,
  getReservaInfoPorToken,
  reservarComoInvitado,
} from "../controllers/reservaInvitadoController.js";

const router = Router();

// Crear reserva como invitado
router.post("/:slug", reservarComoInvitado);
// api
export const getInfoReservaInvitado = (token) => {
  return axiosPublic.get(`/reserva/invitado/info-por-token?token=${token}`);
};

export const postCancelarHoraInvitado = (token) => {
  return axiosPublic.post("/reserva/invitado/cancelar-reserva-invitado", {
    token,
  });
};


export default router;
