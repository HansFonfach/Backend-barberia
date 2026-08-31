import { Router } from "express";
import multer from "multer";
import {
  crearComida,
  listarComidas,
  eliminarComida,
  crearAgua,
  listarAguaHoy,
  eliminarAgua,
  crearSuplemento,
  listarSuplementos,
  eliminarSuplemento,
  toggleTomaSuplemento,
} from "../controllers/diarioAlimenticioController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarModulo } from "../middlewares/verificarModulo.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB, misma lógica que el logo
});

// Simétrico para todos los clientes de la empresa, igual que el resto del
// módulo entrenamientoPersonal — cada quien ve/edita solo lo suyo.
router.use(validarToken, verificarModulo("entrenamientoPersonal"));

router.post("/comida", upload.single("foto"), crearComida);
router.get("/comidas", listarComidas);
router.delete("/comida/:id", eliminarComida);

router.post("/agua", crearAgua);
router.get("/agua/hoy", listarAguaHoy);
router.delete("/agua/:id", eliminarAgua);

router.post("/suplemento", crearSuplemento);
router.get("/suplementos", listarSuplementos);
router.delete("/suplemento/:id", eliminarSuplemento);
router.put("/suplemento/:id/toma", toggleTomaSuplemento);

export default router;
