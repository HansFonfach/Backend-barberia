// routes/routes.control.js
import { Router } from "express";
import multer from "multer";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarRol } from "../middlewares/verificarRol.js";
import { verificarModulo } from "../middlewares/verificarModulo.js";
import { actualizarControl, crearControl, obtenerControlDetalle, obtenerControles, subirPlanPdf } from "../controllers/controlNutricional.js";


const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const auth = [validarToken, verificarRol("admin", "profesional"), verificarModulo("fichaClinica")];

router.get("/:fichaId", ...auth, obtenerControles);
router.get("/detalle/:controlId", ...auth, obtenerControlDetalle);
router.post("/", ...auth, crearControl);
router.put("/:controlId", ...auth, actualizarControl);
router.post("/:controlId/plan-pdf", ...auth, upload.single("pdf"), subirPlanPdf);

export default router;