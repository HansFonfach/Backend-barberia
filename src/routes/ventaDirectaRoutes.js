import express from "express";
import {
  crearVentaDirecta,
  listarVentasDirectas,
  obtenerVentaDirecta,
  anularVentaDirecta,
  estadisticasVentasDirectas,
} from "../controllers/ventaDirectaController.js";
import { validarToken } from "../middlewares/validarToken.js";

// Importa tus middlewares tal como los usas en el resto de rutas

const router = express.Router();

router.get("/estadisticas", estadisticasVentasDirectas);

router.post("/ventas-directas", validarToken, crearVentaDirecta);
router.get("/ventas-directas", validarToken, listarVentasDirectas);
router.get("/ventas-directas/:id", validarToken, obtenerVentaDirecta);
router.patch("/ventas-directas/:id/anular", validarToken, anularVentaDirecta);

export default router;
