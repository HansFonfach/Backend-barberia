import { Router } from "express";
import multer from "multer";
import {
  crearSolicitud,
  getMisSolicitudes,
  getSolicitudesPendientes,
  aprobarSolicitud,
  rechazarSolicitud,
} from "../controllers/solicitudMembresiaClaseController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarRol } from "../middlewares/verificarRol.js";
import { verificarModulo } from "../middlewares/verificarModulo.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Mismo resguardo que el resto del módulo de clases: solo empresas con
// modulos.clasesGrupales = true.
router.use(validarToken, verificarModulo("clasesGrupales"));

router.post("/", upload.single("comprobante"), crearSolicitud);
router.get("/mias", getMisSolicitudes);

router.get("/pendientes", verificarRol("esAdmin"), getSolicitudesPendientes);
router.patch("/:id/aprobar", verificarRol("esAdmin"), aprobarSolicitud);
router.patch("/:id/rechazar", verificarRol("esAdmin"), rechazarSolicitud);

export default router;
