import { Router } from "express";
import {
  getUsuarios,
  getUsuarioById,
  updateUsuario,
  getUsuarioByRut,
  getAllUsersWithSuscripcion,
  verMisPuntos,
  crearBarbero,
  cambiarEstadoUsuario,
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
router.post("/barbero/crearBarbero", validarToken, crearBarbero);
router.get("/:id", validarToken, getUsuarioById);
router.put("/:id", validarToken, updateUsuario);
router.patch("/:id/estado", validarToken, cambiarEstadoUsuario);

export default router;
