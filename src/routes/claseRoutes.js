import { Router } from "express";
import {
  crearClase,
  listarClases,
  getClasesPublicas,
  actualizarClase,
  toggleActivaClase,
  eliminarClase,
  getSesionesDisponibles,
  getSesionesPublicas,
  inscribirCliente,
  inscribirPruebaGratisInvitado,
  cancelarInscripcion,
  marcarPagoInscripcion,
  misInscripciones,
  listarInscritosPorSesion,
  crearExcepcionClase,
  eliminarExcepcionClase,
} from "../controllers/claseController.js";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarRol } from "../middlewares/verificarRol.js";
import { verificarModulo } from "../middlewares/verificarModulo.js";

const router = Router();

// Catálogo público para el landing de la empresa (sin login) — va ANTES del
// validarToken de abajo a propósito, para que quede sin autenticación.
router.get("/:slug/publicas", getClasesPublicas);

// Horarios/cupos sin login, para que el invitado elija día y hora antes de
// llenar sus datos (misma lógica que /sesiones, resuelta por slug).
router.get("/:slug/sesiones-publicas", getSesionesPublicas);

// Agendar la clase de prueba gratis sin crear cuenta (también pública,
// también antes del validarToken). Está deliberadamente restringida a
// tipoAcceso "prueba_gratis" dentro del controlador — ver el comentario
// en inscribirPruebaGratisInvitado.
router.post("/:slug/prueba-gratis", inscribirPruebaGratisInvitado);

// Todo el resto de este módulo solo existe para empresas con
// modulos.clasesGrupales = true (gimnasios, boxes, etc.). Para el resto de
// las empresas (barberías, salones) este flag nunca está activo, así que
// estas rutas no las afectan en nada.
router.use(validarToken, verificarModulo("clasesGrupales"));

// Clases (plantillas)
router.get("/", listarClases);
router.post("/", verificarRol("esAdmin"), crearClase);
router.put("/:id", verificarRol("esAdmin"), actualizarClase);
router.patch("/:id/toggle-activa", verificarRol("esAdmin"), toggleActivaClase);
router.delete("/:id", verificarRol("esAdmin"), eliminarClase);

// Sesiones (ocurrencias generadas a partir del horario semanal de cada clase)
router.get("/sesiones", getSesionesDisponibles);
router.get("/:id/inscritos", verificarRol("esAdmin"), listarInscritosPorSesion);

// Inscripciones de clientes a sesiones puntuales
router.get("/mis-inscripciones", misInscripciones);
router.post("/:id/inscribir", inscribirCliente);
router.patch("/inscripcion/:inscripcionId/cancelar", cancelarInscripcion);
router.patch(
  "/inscripcion/:inscripcionId/pago",
  verificarRol("esAdmin"),
  marcarPagoInscripcion,
);

// Excepciones puntuales (cancelar una fecha o cambiar su cupo)
router.post("/:id/excepciones", verificarRol("esAdmin"), crearExcepcionClase);
router.delete(
  "/excepciones/:excepcionId",
  verificarRol("esAdmin"),
  eliminarExcepcionClase,
);

export default router;
