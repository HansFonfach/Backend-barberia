import { Router } from "express";
import { validarToken } from "../middlewares/validarToken.js";
import { verificarRol } from "../middlewares/verificarRol.js";
import { verificarModulo } from "../middlewares/verificarModulo.js";
import { limitarEscrituraPublica, limitarLecturaPublica } from "../middlewares/publicRateLimiter.js";
import {
  obtenerConfiguracion,
  guardarConfiguracion,
  agenda,
  listarReservas,
  obtenerReserva,
  crearReserva,
  editarReserva,
  cambiarEstado,
  registrarPago,
  resumen,
} from "../controllers/canchaController.js";
import {
  info,
  disponibilidadPublica,
  reservarPublico,
  infoCancelacion,
  cancelarPublico,
  anotarListaEspera,
} from "../controllers/canchaPublicaController.js";

const router = Router();

/* ── Público (sin login) ── rutas fijas antes que "/:slug" ── */
router.get("/publico/cancelacion/:token", limitarLecturaPublica, infoCancelacion);
router.post("/publico/cancelar", limitarEscrituraPublica, cancelarPublico);
router.get("/publico/:slug/info", limitarLecturaPublica, info);
router.get("/publico/:slug/disponibilidad", limitarLecturaPublica, disponibilidadPublica);
router.post("/publico/:slug/lista-espera", limitarEscrituraPublica, anotarListaEspera);
router.post("/publico/:slug", limitarEscrituraPublica, reservarPublico);

/* ── Panel ──
   personal = encargados del recinto (rol "barbero") y admin
   admin    = verificarRol() sin roles deja pasar solo a esAdmin */
const personal = [validarToken, verificarModulo("canchas"), verificarRol("barbero")];
const admin = [validarToken, verificarModulo("canchas"), verificarRol()];

router.get("/configuracion", ...personal, obtenerConfiguracion);
router.put("/configuracion", ...admin, guardarConfiguracion);
router.get("/agenda", ...personal, agenda);
router.get("/resumen", ...admin, resumen);

router.get("/reservas", ...personal, listarReservas);
router.post("/reservas", ...personal, crearReserva);
router.get("/reservas/:id", ...personal, obtenerReserva);
router.patch("/reservas/:id", ...personal, editarReserva);
router.patch("/reservas/:id/estado", ...personal, cambiarEstado);
router.patch("/reservas/:id/pago", ...personal, registrarPago);

export default router;
