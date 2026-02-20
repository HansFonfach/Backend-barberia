import { tx } from "../libs/webpay.js";
import suscripcionModel from "../models/suscripcion.model.js";
import transaccionModel from "../models/transaccion.model.js";
import usuarioModel from "../models/usuario.model.js";
import { sendSuscriptionActiveEmail } from "./mailController.js";

const FRONT_URL = "http://localhost:3000";
const RESULT_URL = `${FRONT_URL}/admin/suscripcion/resultado`;

/* =====================================================
   INICIAR PAGO
===================================================== */
export const iniciarPagoSuscripcion = async (req, res) => {
  try {
    const userId = req.usuario?.id;
    if (!userId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    // Validar suscripción activa
    const suscripcionActiva = await suscripcionModel.findOne({
      usuario: userId,
      activa: true,
      fechaFin: { $gt: new Date() },
    });

    if (suscripcionActiva) {
      return res.status(400).json({
        success: false,
        error: "Ya tienes una suscripción activa",
      });
    }

    const monto = 25000;

    const buyOrder = `ord-${Date.now()}-${userId.toString().slice(-6)}`;
    const sessionId = `ses-${userId}`.substring(0, 61);

    const returnUrl = "http://localhost:4000/pagos/suscripcion/confirmar";

    const response = await tx.create(buyOrder, sessionId, monto, returnUrl);

    await transaccionModel.create({
      usuario: userId,
      buyOrder,
      sessionId,
      token: response.token,
      monto,
      estado: "iniciado",
    });

    return res.json({
      success: true,
      token: response.token,
      url: response.url,
    });
  } catch (error) {
    console.error("❌ Error iniciarPagoSuscripcion:", error);
    return res.status(500).json({ error: "Error iniciando pago" });
  }
};

/* =====================================================
   CONFIRMAR PAGO (CALLBACK TRANSBANK)
===================================================== */
export const confirmarPagoSuscripcion = async (req, res) => {
  let token;

  try {
  

    token = req.query.token_ws || req.body?.token_ws;

    /* ===============================
       CANCELADO POR USUARIO
    =============================== */
    if (req.query.TBK_TOKEN) {
      await transaccionModel.findOneAndUpdate(
        { token: req.query.TBK_TOKEN },
        { estado: "cancelado" }
      );

      return res.redirect(`${RESULT_URL}?cancelado=true`);
    }

    if (!token) {
      return res.redirect(`${RESULT_URL}?error=true`);
    }

    /* ===============================
       COMMIT TRANSBANK
    =============================== */
    const result = await tx.commit(token);
 

    /* ===============================
       PAGO RECHAZADO
    =============================== */
    if (result.response_code !== 0) {
      await transaccionModel.findOneAndUpdate(
        { buyOrder: result.buy_order },
        {
          estado: "rechazado",
          respuestaTransbank: result,
        }
      );

      return res.redirect(`${RESULT_URL}?rechazado=true`);
    }

    /* ===============================
       PAGO APROBADO
    =============================== */
    const userId = result.session_id.replace("ses-", "");

    // Evitar doble suscripción
    const existente = await suscripcionModel.findOne({
      transaccionId: result.buy_order,
    });

    if (existente) {
      return res.redirect(`${RESULT_URL}?success=true`);
    }

    const fechaInicio = new Date();
    const fechaFin = new Date();
    fechaFin.setDate(fechaFin.getDate() + 31);

    const nuevaSuscripcion = await suscripcionModel.create({
      usuario: userId,
      activa: true,
      fechaInicio,
      fechaFin,
      serviciosTotales: 2,
      serviciosUsados: 0,
      transaccionId: result.buy_order,
      montoPagado: result.amount,
      fechaPago: new Date(),
    });

    await transaccionModel.findOneAndUpdate(
      { buyOrder: result.buy_order },
      {
        estado: "aprobado",
        suscripcion: nuevaSuscripcion._id,
        respuestaTransbank: result,
      }
    );

    const usuario = await usuarioModel.findByIdAndUpdate(
      userId,
      {
        suscrito: true,
        fechaSuscripcion: new Date(),
      },
      { new: true }
    );

    // Email
    await sendSuscriptionActiveEmail(usuario.email, {
      nombreCliente: usuario.nombre,
      fechaInicio,
      fechaFin,
    });

    /* ===============================
       REDIRECT FINAL (SUCCESS)
    =============================== */
    return res.redirect(
      `${RESULT_URL}` +
        `?success=true` +
        `&suscripcionId=${nuevaSuscripcion._id}` +
        `&fechaInicio=${encodeURIComponent(fechaInicio.toISOString())}` +
        `&fechaFin=${encodeURIComponent(fechaFin.toISOString())}` +
        `&nombre=${encodeURIComponent(usuario.nombre)}`
    );
  } catch (error) {
    console.error("❌ ERROR CALLBACK:", error);

    if (token) {
      await transaccionModel.findOneAndUpdate(
        { token },
        { estado: "error", error: error.message }
      );
    }

    return res.redirect(`${RESULT_URL}?error=true`);
  }
};
