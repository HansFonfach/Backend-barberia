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

router.get("/test/recordatorio-14h/:reservaId", async (req, res) => {
  const { reservaId } = req.params;

  try {
    const reserva = await Reserva.findById(reservaId)
      .populate("servicio", "nombre instrucciones")
      .populate("barbero", "nombre apellido")
      .populate(
        "empresa",
        "nombre direccion telefono politicaCancelacion slug",
      );

    if (!reserva) return res.json({ error: "Reserva no encontrada" });

    const resultado = await RecordatoriosJob.obtenerDatosReserva(reserva);
    if (!resultado) return res.json({ error: "Cliente no encontrado" });

    const { cliente, datos, esHorarioTemprano } = resultado;

    // Te muestra qué slug detectó y qué plantilla usaría
    console.log("🧪 slug:", reserva.empresa?.slug);
    console.log("🧪 esHorarioTemprano:", esHorarioTemprano);
    console.log("🧪 datos:", datos);

    // Enviar de verdad
    await RecordatoriosJob.enviarPorTodosLosCanales(
      cliente,
      datos,
      "14h",
      reserva,
      true,
    );

    return res.json({
      success: true,
      slug: reserva.empresa?.slug,
      esHorarioTemprano,
      datos,
    });
  } catch (err) {
    return res.json({ error: err.message });
  }
});

export default router;
