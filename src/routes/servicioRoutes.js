import { Router } from "express";
import {
  createServicio,
  deleteServicio,
  getServicios,
  getServiciosPublicos,
  updateServicio,
} from "../controllers/servicioController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarRol } from "../middlewares/verificarRol.js";

const router = Router();

// Rutas RESTful
router.get("/", validarToken, getServicios); // Listar todos
router.post("/", validarToken, verificarRol("esAdmin"), createServicio); // Crear nuevo
router.put("/:id", validarToken, verificarRol("esAdmin"),  updateServicio);
router.delete("/:id", validarToken,verificarRol("esAdmin"),   deleteServicio);
router.get("/:slug/serviciosPublicos", getServiciosPublicos);

export default router;
