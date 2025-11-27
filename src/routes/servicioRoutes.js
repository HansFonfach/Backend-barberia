import { Router } from "express";
import {
  createServicio,
  deleteServicio,
  getServicios,
  updateServicio,
} from "../controllers/servicioController.js";
import { validarToken } from "../middlewares/validarToken.js";

const router = Router();

// Rutas RESTful
router.get("/", validarToken, getServicios); // Listar todos
router.post("/", validarToken, createServicio); // Crear nuevo
router.put("/:id", validarToken, updateServicio);
router.delete("/:id", validarToken, deleteServicio);

export default router;
