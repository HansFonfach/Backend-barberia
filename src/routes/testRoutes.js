import { Router } from "express";
import RecordatoriosJob from "../jobs/recordatoriosJob.js";
import { validarToken } from "../middlewares/validarToken.js";
import { obtenerEstadoLookCliente } from "../controllers/clienteAnalyticsController.js";

const router = Router();

// Endpoint para probar recordatorio manualmente
router.post("/test-recordatorio/:reservaId", async (req, res) => {
  try {
    const { reservaId } = req.params;

    const resultado = await RecordatoriosJob.enviarRecordatorioManual(
      reservaId
    );

    res.json(resultado);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Forzar envío de recordatorios del día
router.post("/test-recordatorios-hoy", async (req, res) => {
  try {
    await RecordatoriosJob.enviarRecordatoriosDelDia();

    res.json({
      success: true,
      message: "Recordatorios del día enviados manualmente",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
router.get(
  "/recordatorios-inteligentes",
  validarToken,
  obtenerEstadoLookCliente
);

export default router;
