import { Router } from "express";
import {
  crearMembresia,
  cancelarMembresia,
  estadoMembresiaCliente,
  listarMembresias,
} from "../controllers/membresiaClaseController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarRol } from "../middlewares/verificarRol.js";
import { verificarModulo } from "../middlewares/verificarModulo.js";

const router = Router();

// Mismo resguardo: solo para empresas con modulos.clasesGrupales = true.
router.use(validarToken, verificarModulo("clasesGrupales"));

router.post("/", verificarRol("esAdmin"), crearMembresia);
router.patch("/:id/cancelar", verificarRol("esAdmin"), cancelarMembresia);
router.get("/cliente/:clienteId/estado", estadoMembresiaCliente);
router.get("/", verificarRol("esAdmin"), listarMembresias);

export default router;
