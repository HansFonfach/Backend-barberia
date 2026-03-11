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
import { validarTokenOpcional } from "../middlewares/validarTokenOpcional.js";

const router = Router();

router.post("/", validarToken, verificarRol("esAdmin"), createHorario);

router.get("/barbero/:id/horas-disponibles", validarTokenOpcional, getHorasDisponibles);

router.get("/barbero/:barberoId",  getHorariosByBarbero);

router.delete(
  "/barbero/:barberoId/dia/:diaSemana",
  validarToken,
  deleteHorarioBarberoDia,
);

router.get(
  "/barbero/:barberoId/horarioBase", validarToken,
  getHorarioBasePorDia,
);

router.get("/proximaHoraDisponible", validarToken, getProximaHoraDisponible);

export default router;
