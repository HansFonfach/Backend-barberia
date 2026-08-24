import { Router } from "express";
import multer from "multer";
import {
  crearSolicitud,
  crearSolicitudPublica,
  getMisSolicitudes,
  getSolicitudesPendientes,
  listarSolicitudesAdmin,
  aprobarSolicitud,
  rechazarSolicitud,
} from "../controllers/solicitudMembresiaClaseController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarRol } from "../middlewares/verificarRol.js";
import { verificarModulo } from "../middlewares/verificarModulo.js";
import { limitarEscrituraPublica } from "../middlewares/publicRateLimiter.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Checkout público (sin login): el visitante contrata un plan desde el
// landing. Va ANTES del validarToken de abajo a propósito, para que quede
// sin autenticación — igual que el resto de los endpoints públicos del
// módulo de clases (getClasesPublicas, prueba-gratis, etc.).
router.post(
  "/publica/:slug",
  limitarEscrituraPublica,
  upload.single("comprobante"),
  crearSolicitudPublica,
);

// Mismo resguardo que el resto del módulo de clases: solo empresas con
// modulos.clasesGrupales = true.
router.use(validarToken, verificarModulo("clasesGrupales"));

router.post("/", upload.single("comprobante"), crearSolicitud);
router.get("/mias", getMisSolicitudes);

// Panel de pagos: ?estado=pendiente|aprobada|rechazada|todas (sin query = todas)
router.get("/", verificarRol("esAdmin"), listarSolicitudesAdmin);
// Alias retrocompatible con el frontend/ruta ya existente.
router.get("/pendientes", verificarRol("esAdmin"), getSolicitudesPendientes);
router.patch("/:id/aprobar", verificarRol("esAdmin"), aprobarSolicitud);
router.patch("/:id/rechazar", verificarRol("esAdmin"), rechazarSolicitud);

export default router;
