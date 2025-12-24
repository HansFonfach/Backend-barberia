import { Router } from "express";
import {
  getUsuarios,
  getUsuarioById,
  updateUsuario,
  deleteUsuario,
  getUsuarioByRut,
  getAllUsersWithSuscripcion,
  verMisPuntos,
} from "../controllers/usuarioController.js";
import { validarToken } from "../middlewares/validarToken.js";

const router = Router();

// 🔒 RUTAS ESPECÍFICAS PRIMERO
router.get("/rut/:rut", validarToken, getUsuarioByRut);
router.get("/todosLosUsuarios", validarToken, getAllUsersWithSuscripcion);
router.get("/misPuntos", validarToken, verMisPuntos);

// 📄 GENERALES
router.get("/", validarToken, getUsuarios);

// 🆔 DINÁMICAS AL FINAL
router.get("/:id", validarToken, getUsuarioById);
router.put("/:id", validarToken, updateUsuario);
router.delete("/:id", validarToken, deleteUsuario);

export default router;
