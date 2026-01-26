import { Router } from "express";
import {
  createHorario,
  deleteHorarioBarberoDia,
  getHorarioBasePorDia,
  getHorariosByBarbero,
  getHorasDisponibles,
  getProximaHoraDisponible,
} from "../controllers/horarioController.js";
import { validarToken } from "../middlewares/validarToken.js";

const router = Router();

router.post("/", validarToken, createHorario);

router.get("/barbero/:id/horas-disponibles", validarToken, getHorasDisponibles);

router.get("/barbero/:barberoId", validarToken, getHorariosByBarbero);

router.delete(
  "/barbero/:barberoId/dia/:diaSemana",
  validarToken,
  deleteHorarioBarberoDia,
);

router.get(
  "/barbero/:barberoId/horarioBase",
  validarToken,
  getHorarioBasePorDia,
);

router.get("/proximaHoraDisponible", validarToken, getProximaHoraDisponible);

export default router;
