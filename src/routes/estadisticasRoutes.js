import { Router } from "express";

import { validarToken } from "../middlewares/validarToken.js";
import {
  citasEsteMes,
  getHoraMasSolicitada,
  getProximoCliente,
  getTop5ClientesAsistentes,
  getTop5ClientesCanceladores,
  getTop5ClientesNoAsistidos,
  horaMasCancelada,
  ingresoMensual,
  ingresoTotal,
  proximaReserva,
  reservasCanceladas,
  reservasCompletadas,
  reservasNoAsistidas,
  servicioMasPopular,
  tasaDeAsistencia,
  tasaDeCancelacion,
  totalClientes,
  totalReservasHoyBarbero,
  totalSuscripcionesActivas,
  ultimaReserva,
} from "../controllers/estadisticasController.js";
("../controllers/excepcionHorarioController.js");

const router = Router();

// Rutas RESTful

router.get("/reservasHoyBarbero", validarToken, totalReservasHoyBarbero);
router.get("/suscripcionesActivas", validarToken, totalSuscripcionesActivas);
router.get("/totalClientes", validarToken, totalClientes);
router.get("/ingresoMensual", validarToken, ingresoMensual);
router.get("/citasMes", validarToken, citasEsteMes);
router.get("/ultima-reserva", validarToken, ultimaReserva);
router.get("/proxima-reserva", validarToken, proximaReserva);
router.get("/top5-clientes-asistencia", validarToken, getTop5ClientesAsistentes);
router.get("/top5-clientes-canceladores", validarToken, getTop5ClientesCanceladores)
router.get("/top5-clientes-no-asisten", validarToken, getTop5ClientesNoAsistidos)
router.get("/horaMasSolicitada", validarToken, getHoraMasSolicitada);
router.get("/proximo-cliente", validarToken, getProximoCliente);
router.get("/ingreso-total", validarToken, ingresoTotal);

router.get("/reservas-completadas", validarToken, reservasCompletadas);
router.get("/reservas-canceladas", validarToken, reservasCanceladas);
router.get("/reservas-no-asistidas", validarToken, reservasNoAsistidas);
router.get("/hora-mas-cancelada", validarToken, horaMasCancelada);
router.get("/servicio-mas-popular", validarToken, servicioMasPopular);
router.get("/tasa-de-cancelacion", validarToken, tasaDeCancelacion);
router.get("/tasa-de-asistencia", validarToken, tasaDeAsistencia);

export default router;
