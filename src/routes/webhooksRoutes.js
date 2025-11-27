import { Router } from "express";
import { enviarMensaje, respuesta } from "../controllers/webhooksController.js";

const router = Router();

router.post("/whatsapp", enviarMensaje);
router.get("/respuestas", respuesta);

export default router;