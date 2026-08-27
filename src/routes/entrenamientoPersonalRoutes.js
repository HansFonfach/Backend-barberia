import { Router } from "express";
import {
  crearRegistroEntrenamiento,
  listarMisRegistrosEntrenamiento,
  listarCatalogoEjercicios,
  eliminarRegistroEntrenamiento,
  getMiProgresoEntrenamiento,
} from "../controllers/entrenamientoPersonalController.js";
import {
  crearRutina,
  listarMisRutinas,
  listarRutinasCompartidas,
  actualizarRutina,
  eliminarRutina,
} from "../controllers/rutinaController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarModulo } from "../middlewares/verificarModulo.js";

const router = Router();

// Módulo simétrico para todos los clientes de la empresa (dueño + amigos
// invitados) — no se exige esAdmin en ninguna ruta, cada quien solo puede
// ver/crear/borrar sus propios registros (ver controller).
router.use(validarToken, verificarModulo("entrenamientoPersonal"));

router.post("/registro", crearRegistroEntrenamiento);
router.get("/mis-registros", listarMisRegistrosEntrenamiento);
router.get("/catalogo-ejercicios", listarCatalogoEjercicios);
router.delete("/registro/:id", eliminarRegistroEntrenamiento);
router.get("/mi-progreso", getMiProgresoEntrenamiento);

router.post("/rutina", crearRutina);
router.get("/mis-rutinas", listarMisRutinas);
router.get("/rutinas-compartidas", listarRutinasCompartidas);
router.put("/rutina/:id", actualizarRutina);
router.delete("/rutina/:id", eliminarRutina);

export default router;
