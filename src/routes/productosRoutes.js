import { Router } from "express";
import {
  createProducto,
  deleteProducto,
  getAllProductos,
  updateProducto,
} from "../controllers/productosController.js";
import { verificarRol } from "../middlewares/verificarRol.js";
import { deleteCanje } from "../controllers/canjeController.js";
import { validarToken } from "../middlewares/validarToken.js";

const router = Router();

router.get(
  "/listarProductos",
  validarToken,
  verificarRol("esAdmin"),
  getAllProductos,
);
router.post(
  "/crearProducto",
  validarToken,
  verificarRol("esAdmin"),
  createProducto,
);
router.put(
  "/actualizarProducto/:id",
  validarToken,
  verificarRol("esAdmin"),
  updateProducto,
);
router.put(
  "/eliminarProducto/:id",
  validarToken,
  verificarRol("esAdmin"),
  deleteProducto,
);

export default router;
