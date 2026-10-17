import { Router } from "express";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarRol } from "../middlewares/verificarRol.js";
import { limitarEscrituraPublica } from "../middlewares/publicRateLimiter.js";
import {
  listarCodigos,
  crearCodigo,
  actualizarCodigo,
  eliminarCodigo,
  validarCodigoPublico,
} from "../controllers/codigoDescuentoController.js";

const router = Router();

// Público: lo usa el cliente (con o sin cuenta) al escribir su código al reservar.
// Limitado por IP para que nadie pruebe códigos al azar.
router.post("/validar/:slug", limitarEscrituraPublica, validarCodigoPublico);

// Panel del negocio — solo admin (verificarRol() sin roles deja pasar solo a esAdmin)
router.get("/", validarToken, verificarRol(), listarCodigos);
router.post("/", validarToken, verificarRol(), crearCodigo);
router.patch("/:id", validarToken, verificarRol(), actualizarCodigo);
router.delete("/:id", validarToken, verificarRol(), eliminarCodigo);

export default router;
