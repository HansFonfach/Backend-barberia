import { Router } from "express";
import {
  getMiProgreso,
  crearMedicionCorporal,
  listarMisMedicionesCorporales,
  listarMedicionesClienteCorporal,
  eliminarMedicionCorporal,
} from "../controllers/progresoClienteController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarRol } from "../middlewares/verificarRol.js";
import { verificarModulo } from "../middlewares/verificarModulo.js";

const router = Router();

// Igual resguardo que el resto de clases/membresías: solo empresas con
// modulos.clasesGrupales activo. A diferencia de estadisticasGimnasioRoutes
// (que es 100% para el admin), acá el cliente también necesita entrar a
// ver/editar su propio progreso, así que NO se exige esAdmin acá arriba.
router.use(validarToken, verificarModulo("clasesGrupales"));

router.get("/mi-progreso", getMiProgreso);

router.post("/medicion-corporal", crearMedicionCorporal);
router.get("/medicion-corporal/mias", listarMisMedicionesCorporales);
router.get(
  "/medicion-corporal/cliente/:clienteId",
  verificarRol("esAdmin"),
  listarMedicionesClienteCorporal,
);
router.delete("/medicion-corporal/:id", eliminarMedicionCorporal);

export default router;
