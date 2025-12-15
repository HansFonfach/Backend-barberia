import { Router } from "express";
import {
  iniciarPagoSuscripcion,
  confirmarPagoSuscripcion,
} from "../controllers/pagoController.js";
import { validarToken } from "../middlewares/validarToken.js";

const router = Router();

router.post("/suscripcion/iniciar", validarToken, iniciarPagoSuscripcion);
router.get("/suscripcion/confirmar", confirmarPagoSuscripcion);
// Considera agregar esta ruta para manejar fallos
router.post("/suscripcion/cancelar", (req, res) => {
  // Lógica para manejar pagos cancelados
  res.json({ message: "Pago cancelado" });
});

export default router;
