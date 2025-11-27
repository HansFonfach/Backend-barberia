import { Router } from "express";

import { validarToken } from "../middlewares/validarToken.js";
import {
  agregarHoraExtra,
  cancelarHora,
  cancelarHoraExtra,
  obtenerExcepcionesPorDia,
  revertirHora,
} from "../controllers/excepcionHorarioController.js";

const router = Router();

// Rutas RESTful

router.post("/cancelar", validarToken, cancelarHora); // Crear nuevo
router.post("/revertir", validarToken, revertirHora);
router.post("/agregar-hora-extra", validarToken, agregarHoraExtra);
router.post("/cancelar-hora-extra", validarToken, cancelarHoraExtra);
router.get("/:barberoId", validarToken, obtenerExcepcionesPorDia);

export default router;
