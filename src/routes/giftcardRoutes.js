import { Router } from "express";
import multer from "multer";
import {
  configPublica,
  crearSolicitudPublica,
  verTarjetaPublica,
  listarGiftcards,
  detalleGiftcard,
  crearGiftcardPanel,
  aprobarGiftcard,
  rechazarGiftcard,
  anularGiftcard,
  reenviarGiftcard,
  getConfiguracion,
  putConfiguracion,
} from "../controllers/giftcardController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarRol } from "../middlewares/verificarRol.js";
import { limitarEscrituraPublica, limitarLecturaPublica } from "../middlewares/publicRateLimiter.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
// Igual que upload.single, pero si el archivo es muy grande responde JSON (no un 500)
const recibirComprobante = (req, res, next) =>
  upload.single("comprobante")(req, res, (err) => {
    if (!err) return next();
    return res.status(400).json({
      message: err.code === "LIMIT_FILE_SIZE" ? "El comprobante no puede pesar más de 8 MB" : "No se pudo leer el comprobante",
    });
  });

// Público (sin login): página "Regalar" y la giftcard en línea
router.get("/publico/:slug", limitarLecturaPublica, configPublica);
router.post("/publico/:slug/solicitud", limitarEscrituraPublica, recibirComprobante, crearSolicitudPublica);
router.get("/publico/:slug/tarjeta/:codigo", limitarLecturaPublica, verTarjetaPublica);

// Panel del negocio — solo admin (verificarRol() sin roles deja pasar solo a esAdmin)
router.get("/configuracion", validarToken, verificarRol(), getConfiguracion);
router.put("/configuracion", validarToken, verificarRol(), putConfiguracion);
router.get("/", validarToken, verificarRol(), listarGiftcards);
router.post("/", validarToken, verificarRol(), crearGiftcardPanel);
router.get("/:id", validarToken, verificarRol(), detalleGiftcard);
router.patch("/:id/aprobar", validarToken, verificarRol(), aprobarGiftcard);
router.patch("/:id/rechazar", validarToken, verificarRol(), rechazarGiftcard);
router.patch("/:id/anular", validarToken, verificarRol(), anularGiftcard);
router.post("/:id/reenviar", validarToken, verificarRol(), reenviarGiftcard);

export default router;
