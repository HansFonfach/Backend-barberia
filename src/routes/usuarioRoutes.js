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
  getBarberosPublicos,
  updatePerfil,
} from "../controllers/usuarioController.js";
import { validarToken } from "../middlewares/validarToken.js";

const router = Router();

// 🔒 RUTAS ESPECÍFICAS PRIMERO
router.get("/rut/:rut", validarToken, getUsuarioByRut);
router.get("/todosLosUsuarios", validarToken, getAllUsersWithSuscripcion);
router.get("/misPuntos", validarToken, verMisPuntos);
router.put("/actualizarPerfil", validarToken, updatePerfil); // ✅ AQUÍ

// 📄 GENERALES
router.get("/", validarToken, getUsuarios);
router.get("/barbero/:slug/barberos", getBarberosPublicos);
router.post("/barbero/crearBarbero", validarToken, crearBarbero);

// 🆔 DINÁMICAS AL FINAL
router.get("/:id", validarToken, getUsuarioById);
router.put("/:id", validarToken, updateUsuario);
router.patch("/:id/estado", validarToken, cambiarEstadoUsuario);

export default router;