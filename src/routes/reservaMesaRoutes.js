import { Router } from "express";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarRol } from "../middlewares/verificarRol.js";
import { verificarModulo } from "../middlewares/verificarModulo.js";
import {
  limitarEscrituraPublica,
  limitarLecturaPublica,
} from "../middlewares/publicRateLimiter.js";
import {
  obtenerConfiguracion,
  guardarConfiguracion,
  listarBloqueos,
  crearBloqueo,
  eliminarBloqueo,
  afectadasDeBloqueo,
  cancelarAfectadas,
  disponibilidad,
  reservasDelDia,
  listarReservas,
  crear,
  obtener,
  editar,
  cambiarEstado,
  resumen,
  calendario,
} from "../controllers/reservaMesaController.js";
import {
  info,
  disponibilidadPublica,
  reservarPublico,
  infoCancelacion,
  cancelarPublico,
} from "../controllers/reservaMesaPublicaController.js";

const router = Router();

/* ── Público (sin login) ── rutas fijas antes que "/:id" ── */
router.get("/publico/cancelacion/:token", limitarLecturaPublica, infoCancelacion);
router.post("/publico/cancelar", limitarEscrituraPublica, cancelarPublico);
router.get("/publico/:slug/info", limitarLecturaPublica, info);
router.get("/publico/:slug/disponibilidad", limitarLecturaPublica, disponibilidadPublica);
router.post("/publico/:slug", limitarEscrituraPublica, reservarPublico);

/* ── Panel ──
   personal = profesionales del local (rol "barbero") y admin
   admin    = verificarRol() sin roles deja pasar solo a esAdmin */
const personal = [validarToken, verificarModulo("reservasMesas"), verificarRol("barbero")];
const admin = [validarToken, verificarModulo("reservasMesas"), verificarRol()];

router.get("/configuracion", ...personal, obtenerConfiguracion);
router.put("/configuracion", ...admin, guardarConfiguracion);

router.get("/bloqueos", ...personal, listarBloqueos);
router.post("/bloqueos", ...admin, crearBloqueo);
router.delete("/bloqueos/:id", ...admin, eliminarBloqueo);
router.get("/bloqueos/:id/afectadas", ...admin, afectadasDeBloqueo);
router.post("/bloqueos/:id/cancelar-afectadas", ...admin, cancelarAfectadas);

router.get("/disponibilidad", ...personal, disponibilidad);
router.get("/dia/:fecha", ...personal, reservasDelDia);
router.get("/resumen", ...admin, resumen);
router.get("/calendario", ...personal, calendario);

router.get("/", ...personal, listarReservas);
router.post("/", ...personal, crear);
router.get("/:id", ...personal, obtener);
router.patch("/:id", ...personal, editar);
router.patch("/:id/estado", ...personal, cambiarEstado);

export default router;
