import { Router } from "express";
import RecordatoriosJob from "../jobs/recordatoriosJob.js";
import retencionCron from "../cron/recordatoriosVolver.js"; // 👈 agrega este
import { validarToken } from "../middlewares/validarToken.js";
import { obtenerEstadoLookCliente } from "../controllers/clienteAnalyticsController.js";

const router = Router();

// Prueba recordatorios de citas (24h / 3h)
router.post("/test-recordatorio/:reservaId", async (req, res) => {
  try {
    const resultado = await RecordatoriosJob.testEnviar(req.params.reservaId);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Prueba retención — clientes que no vuelven 👈 ahora usa el archivo correcto
router.post("/test-recordatorios-hoy", async (req, res) => {
  try {
    const result = await retencionCron.enviarRecordatoriosDelDia();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get(
  "/recordatorios-inteligentes",
  validarToken,
  obtenerEstadoLookCliente,
);

router.get("/test-recordatorio/:reservaId", async (req, res) => {
  const resultado = await RecordatoriosJob.testEnviar(req.params.reservaId);
  res.json(resultado);
});

router.get("/test-whatsapp/:reservaId", async (req, res) => {
  const resultado = await RecordatoriosJob.testEnviar(req.params.reservaId);
  res.json(resultado);
});

export default router;
