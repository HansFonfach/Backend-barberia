import { Router } from "express";
import {
  loginSuperAdmin,
  logoutSuperAdmin,
  listarEmpresas,
  actualizarEstadoEmpresa,
  actualizarEstadoSuscripcion,
  actualizarCobro,
  registrarPago,
  resumenGanancias,
} from "../controllers/superAdminController.js";
import { verificarSuperAdmin } from "../middlewares/verificarSuperAdmin.js";

const router = Router();

// Público (es el login del panel)
router.post("/login", loginSuperAdmin);

// Protegidas — todo lo demás requiere el token de super-admin
router.post("/logout", verificarSuperAdmin, logoutSuperAdmin);
router.get("/empresas", verificarSuperAdmin, listarEmpresas);
router.patch("/empresas/:id/estado", verificarSuperAdmin, actualizarEstadoEmpresa);
router.patch("/empresas/:id/suscripcion", verificarSuperAdmin, actualizarEstadoSuscripcion);
router.patch("/empresas/:id/cobro", verificarSuperAdmin, actualizarCobro);
router.post("/empresas/:id/pago", verificarSuperAdmin, registrarPago);
router.get("/ganancias", verificarSuperAdmin, resumenGanancias);

export default router;
