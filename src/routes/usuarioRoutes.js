import { Router } from "express";
import {
  getUsuarios,
  getUsuarioById,
  updateUsuario,
  deleteUsuario,
  getUsuarioByRut,
  getAllUsersWithSuscripcion,
} from "../controllers/usuarioController.js";
import { validarToken } from "../middlewares/validarToken.js";

const router = Router();
// 👇 ESTA RUTA DEBE IR ANTES QUE "/:id"
router.get("/rut/:rut", validarToken, getUsuarioByRut);
router.get("/todosLosUsuarios", validarToken, getAllUsersWithSuscripcion); // ✅ ruta estática antes
router.get("/", validarToken, getUsuarios); // Listar todos
router.get("/:id", validarToken, getUsuarioById); // Obtener uno por ID
router.put("/:id", validarToken, updateUsuario); // Actualizar
router.delete("/:id", validarToken, deleteUsuario); // Eliminar

export default router;
