// routes/usuarioRoutes.js
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
  actualizarNotaCliente,
  updateUsuarioDesdeAdmin,
} from "../controllers/usuarioController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarRol } from "../middlewares/verificarRol.js";
import { upload } from "../middlewares/upload.js";

const router = Router();

// ✅ 1. PRIMERO: TODAS LAS RUTAS ESPECÍFICAS (con strings fijos)
router.get("/rut/:rut", validarToken, getUsuarioByRut);
router.get("/publico/:slug/rut/:rut", getUsuarioByRutPublico);
router.get("/todosLosUsuarios", validarToken, getAllUsersWithSuscripcion);
router.get("/misPuntos", validarToken, verMisPuntos);
router.put("/actualizarPerfil", validarToken, updatePerfil);
router.put("/:id/notas", validarToken, actualizarNotaCliente);

// ✅ 2. RUTA ESPECÍFICA CON PARÁMETRO (pero con string fijo adicional)
router.put("/:id/actualizarUsuario", validarToken, updateUsuarioDesdeAdmin);

// ✅ 3. RUTAS GENERALES (sin parámetros)
router.get("/", validarToken, getUsuarios);
router.get("/barbero/:slug/barberos", getBarberosPublicos);
router.post(
  "/barbero/crearBarbero",
  validarToken,
  verificarRol("esAdmin"),
  upload.single("fotoPerfil"),
  crearBarbero,
);

// ✅ 4. ÚLTIMO: TODAS LAS RUTAS CON PARÁMETROS DINÁMICOS (/:id)
router.get("/:id", validarToken, getUsuarioById);
router.put(
  "/:id",
  validarToken,
  verificarRol("esAdmin"),
  upload.single("fotoPerfil"),
  updateUsuario,
);
router.patch(
  "/:id/estado",
  validarToken,
  verificarRol("esAdmin"),
  cambiarEstadoUsuario,
);

export default router;
