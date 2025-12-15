// src/controllers/pagoController.js
import { tx } from "../libs/webpay.js";
import suscripcionModel from "../models/suscripcion.model.js";
import transaccionModel from "../models/transaccion.model.js";
import usuarioModel from "../models/usuario.model.js";
import { sendSuscriptionActiveEmail } from "./mailController.js";

export const iniciarPagoSuscripcion = async (req, res) => {
  try {
    const userId = req.usuario?.id;

    if (!userId) {
      return res.status(400).json({ error: "Usuario no autenticado" });
    }

    // Verificar suscripción activa
    const suscripcionActiva = await suscripcionModel.findOne({
      usuario: userId,
      activa: true,
      fechaFin: { $gt: new Date() },
    });

    if (suscripcionActiva) {
      return res.status(400).json({
        success: false,
        error: "Ya tienes una suscripción activa",
        fechaFin: suscripcionActiva.fechaFin,
      });
    }

    const monto = 25000;

    // Generar buyOrder (formato: ord-timestamp-userId)
    const timestamp = Date.now().toString().slice(-9);
    const userIdShort = userId.toString().slice(-6);
    const buyOrder = `ord-${timestamp}-${userIdShort}`;

    const sessionId = `ses-${userId}`.substring(0, 61);

    const returnUrl = `${
      process.env.BACKEND_URL || "http://localhost:4000"
    }/pagos/suscripcion/confirmar`;

    // Crear transacción en Transbank
    const response = await tx.create(buyOrder, sessionId, monto, returnUrl);

    // Guardar transacción en nuestra BD
    const nuevaTransaccion = await transaccionModel.create({
      usuario: userId,
      buyOrder,
      sessionId,
      token: response.token,
      monto,
      estado: "iniciado",
      metadata: {
        tipoSuscripcion: "mensual",
        serviciosIncluidos: 2,
      },
      ipCliente: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return res.json({
      success: true,
      token: response.token,
      url: response.url,
      transaccionId: nuevaTransaccion._id,
      buyOrder: buyOrder,
    });
  } catch (error) {
    console.error("❌ Error iniciarPagoSuscripcion:", error.message);

    if (error.message.includes("is too long")) {
      return res.status(400).json({
        success: false,
        error: "Parámetros inválidos",
        message: "Los datos exceden los límites permitidos por Transbank",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Error al iniciar pago",
      message: error.message,
    });
  }
};

export const confirmarPagoSuscripcion = async (req, res) => {
  try {
    console.log("=== ✅ TRANSBANK CALLBACK ===");
    console.log("Método:", req.method);
    console.log("Query params (GET):", req.query);
    console.log("Body (POST):", req.body);

    // Obtener token de diferentes maneras según el método
    let token;

    if (req.method === "GET") {
      token = req.query.token_ws || req.query.TBK_TOKEN;
    } else if (req.method === "POST") {
      token = req.body.token_ws || req.body.TBK_TOKEN;
    }

    console.log("Token encontrado:", token);

    if (!token) {
      console.log("⚠️ No se recibió token");

      // Redirigir al frontend con error
      const frontendUrl = `${
        process.env.FRONTEND_URL || "http://localhost:3000"
      }/suscripcion/resultado?error=true&message=No se recibió token de pago`;
      return res.redirect(frontendUrl);
    }

    // Si es TBK_TOKEN (pago cancelado)
    if (req.query.TBK_TOKEN || req.body?.TBK_TOKEN) {
      console.log("❌ Pago cancelado por el usuario");

      const frontendUrl = `${
        process.env.FRONTEND_URL || "http://localhost:3000"
      }/suscripcion/resultado?cancelado=true`;
      return res.redirect(frontendUrl);
    }

    // Confirmar pago con Transbank
    console.log("🔐 Confirmando pago con Transbank...");
    const result = await tx.commit(token);

    console.log("Resultado Transbank:", {
      response_code: result.response_code,
      buy_order: result.buy_order,
      session_id: result.session_id,
    });

    if (result.response_code !== 0) {
      console.log("❌ Pago rechazado por Transbank");

      const frontendUrl = `${
        process.env.FRONTEND_URL || "http://localhost:3000"
      }/suscripcion/resultado?error=true&message=Pago rechazado por Transbank`;
      return res.redirect(frontendUrl);
    }

    // Extraer userId del session_id
    const userId = result.session_id.replace("ses-", "");
    console.log("✅ Usuario ID:", userId);

    // Verificar si ya existe suscripción para esta transacción
    const existingSuscripcion = await suscripcionModel.findOne({
      transaccionId: result.buy_order,
    });

    if (existingSuscripcion) {
      console.log("ℹ️ Suscripción ya existente, redirigiendo...");

      const frontendUrl = `${
        process.env.FRONTEND_URL || "http://localhost:3000"
      }/admin/suscripcion/resultado?success=true&existe=true`;
      return res.redirect(frontendUrl);
    }

    // Crear suscripción
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
      detallesTransbank: {
        authorizationCode: result.authorization_code,
        paymentTypeCode: result.payment_type_code,
        responseCode: result.response_code,
        cardNumber: result.card_detail?.card_number,
      },
    });

    console.log("✅ Suscripción creada:", nuevaSuscripcion._id);

    // Actualizar transacción
    await transaccionModel.findOneAndUpdate(
      { buyOrder: result.buy_order },
      {
        estado: "aprobado",
        fechaConfirmacion: new Date(),
        respuestaTransbank: result,
        suscripcion: nuevaSuscripcion._id,
      }
    );

    // Actualizar usuario como suscrito
    const usuario = await usuarioModel.findByIdAndUpdate(userId, {
      suscrito: true,
      fechaSuscripcion: new Date(),
    });

    await sendSuscriptionActiveEmail(usuario.email, {
      nombreCliente: usuario.nombre,
      fechaInicio,
      fechaFin,
    });

    console.log("hbola", sendSuscriptionActiveEmail);

    console.log("✅ Usuario actualizado como suscrito");

    // Redirigir al frontend con éxito
    const fechaInicioStr = nuevaSuscripcion.fechaInicio.toISOString();
    const fechaFinStr = nuevaSuscripcion.fechaFin.toISOString();

    const frontendUrl = `${
      process.env.FRONTEND_URL || "http://localhost:3000"
    }/admin/suscripcion/resultado?success=true&suscripcionId=${
      nuevaSuscripcion._id
    }&fechaInicio=${fechaInicioStr}&fechaFin=${fechaFinStr}`;

    console.log("🔗 Redirigiendo a frontend:", frontendUrl);
    return res.redirect(frontendUrl);
  } catch (error) {
    console.error("❌ Error confirmarPagoSuscripcion:", error);

    // Redirigir al frontend con error
    const frontendUrl = `${
      process.env.FRONTEND_URL || "http://localhost:3000"
    }/admin/suscripcion/resultado?error=true&message=${encodeURIComponent(
      error.message
    )}`;
    return res.redirect(frontendUrl);
  }
};
