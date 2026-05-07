import { Router } from "express";
import {
  createHorario,
  deleteHorarioBarberoDia,
  getHorarioBasePorDia,
  getHorariosByBarbero,
  getHorasDisponibles,
  getHorasProfesionalPorDia,
  getProximaHoraDisponible,
} from "../controllers/horarioController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { validarTokenOpcional } from "../middlewares/validarTokenOpcional.js";
import { verificarRol } from "../middlewares/verificarRol.js";
import { crearBloqueoVacaciones, eliminarBloqueoVacaciones, obtenerVacaciones } from "../controllers/excepcionHorarioController.js";

const router = Router();

router.post("/", validarToken, createHorario);

router.get(
  "/barbero/:id/horas-disponibles",
  validarTokenOpcional,
  getHorasDisponibles,
);

router.get("/barbero/:barberoId", getHorariosByBarbero);

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

router.get(
  "/admin/:id/horas",
  validarToken,
  verificarRol("esAdmin"),
  getHorasProfesionalPorDia
);

router.post(
  "/vacaciones",
  
  crearBloqueoVacaciones,
);
router.delete(
  "/vacaciones",
  validarToken,
  verificarRol("esAdmin"),
  eliminarBloqueoVacaciones,
);
router.get(
  "/vacaciones/:barberoId",
  validarToken,
  verificarRol("esAdmin"),
  obtenerVacaciones,
);



export default router;
