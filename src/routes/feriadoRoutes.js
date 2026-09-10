import { Router } from "express";
import {
  getFeriados,
  toggleFeriado,
  cargarFeriadosChile,
  cambiarComportamientoFeriado, // NUEVO — vigente, pero ya no lo usa el motor de disponibilidad (ver toggleFeriadoEmpresa)
  verificarFeriado, // NUEVO
  getFeriadosEmpresa,
  toggleFeriadoEmpresa,
  getDetalleFeriadoEmpresa,
} from "../controllers/feriadoController.js";
import { validarToken } from "../middlewares/validarToken.js";

const router = Router();

router.get("/verificar", verificarFeriado); // pública, se queda así

router.get("/", validarToken, getFeriados);

// Panel "Feriados" por empresa — el interruptor grande (¿la empresa
// atiende este feriado?) más el resumen para la lista. Tienen que ir
// ANTES de las rutas genéricas "/:id/..." de abajo: si no, Express las
// hace calzar con ":id" = "empresa" y nunca llegan a estos handlers.
router.get("/empresa", validarToken, getFeriadosEmpresa);
router.get("/empresa/:feriadoId/detalle", validarToken, getDetalleFeriadoEmpresa);
router.patch("/empresa/toggle", validarToken, toggleFeriadoEmpresa);

router.patch("/:id/toggle", validarToken, toggleFeriado);
router.patch("/:id/comportamiento", validarToken, cambiarComportamientoFeriado);
router.post("/cargar-chile", validarToken, cargarFeriadosChile);

export default router;
