import { Router } from "express";
import {
  iniciarPagoMembresia,
  confirmarPagoMembresia,
} from "../controllers/pagoMembresiaClaseController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarModulo } from "../middlewares/verificarModulo.js";

const router = Router();

// Iniciar pago: requiere sesión + que la empresa tenga el módulo de clases
router.post(
  "/iniciar",
  validarToken,
  verificarModulo("clasesGrupales"),
  iniciarPagoMembresia,
);

// Callback público de Transbank (no lleva JWT, Transbank lo llama directo).
// WebPay Plus redirige normalmente con un POST, pero se deja también el GET
// por si acaso, mismo handler para los dos.
router.post("/confirmar", confirmarPagoMembresia);
router.get("/confirmar", confirmarPagoMembresia);

export default router;
