import { Router } from "express";
import {
  canjear,
  createCanje,
  deleteCanje,
  getAllCanje,
  updateCanje,
} from "../controllers/canjeController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarRol } from "../middlewares/verificarRol.js";

const router = Router();

router.get("/listarCanjes", validarToken, getAllCanje);
router.post("/crearCanje", validarToken, verificarRol("esAdmin"),  createCanje);
router.put("/actualizarCanje/:id", validarToken, verificarRol("esAdmin"),  updateCanje);
router.put("/eliminarCanje/:id", validarToken, verificarRol("esAdmin"), deleteCanje);
router.post("/canjear/:idCanje", validarToken, canjear);

export default router;
