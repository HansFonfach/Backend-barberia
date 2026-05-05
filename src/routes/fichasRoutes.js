// routes/routes.ficha.js
import { Router } from "express";

import { actualizarFicha, crearFicha, eliminarFicha, obtenerFichaPorPaciente, obtenerFichas } from "../controllers/fichasController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarModulo } from "../middlewares/verificarModulo.js";
import { verificarRol } from "../middlewares/verificarRol.js";

const router = Router();

const modulo = verificarModulo("fichaClinica");
const auth = [validarToken, verificarRol("admin", "barbero"), modulo];

router.get("/", ...auth, obtenerFichas);
router.get("/:pacienteId", ...auth, obtenerFichaPorPaciente);
router.post("/", ...auth, crearFicha);
router.put("/:fichaId", ...auth, actualizarFicha);
router.delete("/:fichaId", ...auth, eliminarFicha);
export default router;