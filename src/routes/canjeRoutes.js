import { Router } from "express";
import {
  canjear,
  createCanje,
  deleteCanje,
  getAllCanje,
  updateCanje,
} from "../controllers/canjeController.js";
import { validarToken } from "../middlewares/validarToken.js";

const router = Router();

router.get("/listarCanjes", validarToken, getAllCanje);
router.post("/crearCanje", validarToken, createCanje);
router.put("/actualizarCanje/:id", validarToken, updateCanje);
router.put("/eliminarCanje/:id", validarToken, deleteCanje);
router.post("/canjear/:idCanje", validarToken, canjear);

export default router;
