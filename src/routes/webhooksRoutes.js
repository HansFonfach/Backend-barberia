import { Router } from "express";
import { enviarMensaje, respuesta } from "../controllers/webhooksController.js";
import { webhookMercadoPago } from "../controllers/planSaasController.js";

const router = Router();

router.post("/whatsapp", enviarMensaje);
router.get("/respuestas", respuesta);
// Avisos de Mercado Pago (pagos de la mensualidad de AgendaFonfach)
router.post("/mercadopago", webhookMercadoPago);

export default router;