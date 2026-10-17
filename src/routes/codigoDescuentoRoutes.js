import { Router } from "express";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarRol } from "../middlewares/verificarRol.js";
import { limitarLecturaPublica } from "../middlewares/publicRateLimiter.js";
import {
  listarCodigos,
  crearCodigo,
  actualizarCodigo,
  eliminarCodigo,
  validarCodigoPublico,
} from "../controllers/codigoDescuentoController.js";

const router = Router();

// Público: lo usa el cliente (con o sin cuenta) al escribir su código al reservar.
// Limitado por IP (120 cada 10 min) para frenar a quien pruebe códigos al azar,
// pero lo bastante holgado para que un cliente cambie de hora varias veces.
router.post("/validar/:slug", limitarLecturaPublica, validarCodigoPublico);

// Panel del negocio — solo admin (verificarRol() sin roles deja pasar solo a esAdmin)
router.get("/", validarToken, verificarRol(), listarCodigos);
router.post("/", validarToken, verificarRol(), crearCodigo);
router.patch("/:id", validarToken, verificarRol(), actualizarCodigo);
router.delete("/:id", validarToken, verificarRol(), eliminarCodigo);

export default router;
