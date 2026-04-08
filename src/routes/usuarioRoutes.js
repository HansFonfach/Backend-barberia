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
  getUsuarioByRutPublico,
} from "../controllers/usuarioController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarRol } from "../middlewares/verificarRol.js";
import { upload } from "../middlewares/upload.js";

const router = Router();

// 🔒 RUTAS ESPECÍFICAS PRIMERO
router.get("/rut/:rut", validarToken, getUsuarioByRut);
router.get("/rutPublico/:rut",  getUsuarioByRutPublico);

router.get("/todosLosUsuarios", validarToken, getAllUsersWithSuscripcion);
router.get("/misPuntos", validarToken, verMisPuntos);
router.put("/actualizarPerfil", validarToken, updatePerfil); // ✅ AQUÍ

// 📄 GENERALES
router.get("/", validarToken, getUsuarios);
router.get("/barbero/:slug/barberos", getBarberosPublicos);
router.post("/barbero/crearBarbero", validarToken, verificarRol("esAdmin"), upload.single("fotoPerfil"), crearBarbero);

// 🆔 DINÁMICAS AL FINAL
router.get("/:id", validarToken, getUsuarioById);
router.put("/:id", validarToken, verificarRol("esAdmin"), upload.single("fotoPerfil"), updateUsuario);
router.patch("/:id/estado", validarToken, verificarRol("esAdmin"),  cambiarEstadoUsuario);

export default router;