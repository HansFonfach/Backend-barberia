import {
  webpayMembresiaTx,
} from "../libs/webpayMembresiaClase.js";
import PlanMembresiaClase from "../models/planMembresiaClase.model.js";
import MembresiaClase from "../models/membresiaClase.model.js";
import TransaccionMembresiaClase from "../models/transaccionMembresiaClase.model.js";
import Empresa from "../models/empresa.model.js";

const FRONTEND_URL = process.env.FRONTEND_URL || "https://www.agendafonfach.cl";

/* =======================================================
   🟢 Iniciar pago online de una mensualidad (WebPay Plus)

   Body esperado: { planId }. El monto SIEMPRE se saca del plan guardado en
   la base de datos (nunca de algo que mande el cliente), y el cliente que
   paga SIEMPRE es el usuario autenticado (nunca un id del body) — así no
   se puede alterar el precio ni pagar/suscribir la cuenta de otra persona.
======================================================= */
export const iniciarPagoMembresia = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const clienteId = req.usuario.id;
    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({ message: "Debes indicar el plan" });
    }

    const empresa = await Empresa.findById(empresaId).select("slug");
    if (!empresa) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    const plan = await PlanMembresiaClase.findOne({
      _id: planId,
      empresa: empresaId,
      activo: true,
    });
    if (!plan) {
      return res
        .status(404)
        .json({ message: "Plan no encontrado o ya no está disponible" });
    }

    const membresiaActiva = await MembresiaClase.findOne({
      empresa: empresaId,
      cliente: clienteId,
      activa: true,
    });
    if (membresiaActiva) {
      return res
        .status(409)
        .json({ message: "Ya tienes una mensualidad activa" });
    }

    const monto = Math.round(plan.precio);

    // buyOrder: máx. 26 caracteres permitidos por Transbank
    const buyOrder = `mc-${Date.now()}-${clienteId.toString().slice(-6)}`;
    // sessionId: máx. 61 caracteres permitidos por Transbank
    const sessionId = `ses-${clienteId}`.substring(0, 61);

    const backendUrl =
      process.env.BACKEND_URL || `${req.protocol}://${req.get("host")}`;
    const returnUrl = `${backendUrl}/pagosMembresiaClase/confirmar`;

    const response = await webpayMembresiaTx.create(
      buyOrder,
      sessionId,
      monto,
      returnUrl,
    );

    await TransaccionMembresiaClase.create({
      empresa: empresaId,
      empresaSlug: empresa.slug,
      cliente: clienteId,
      plan: plan._id,
      nombrePlanSnapshot: plan.nombre,
      clasesIncluidasSnapshot: plan.clasesIncluidas,
      duracionDiasSnapshot: plan.duracionDias,
      tipoCicloSnapshot: plan.tipoCiclo,
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
    console.error("❌ Error iniciarPagoMembresia:", error);
    return res.status(500).json({ message: "Error iniciando el pago" });
  }
};

/* =======================================================
   🟡 Confirmar pago — callback PÚBLICO de Transbank

   Transbank llega acá directo desde su propio servidor (no hay JWT ni
   sesión del cliente), así que toda la identidad de "quién pagó qué" sale
   del token de la transacción, validado contra Transbank con
   webpayMembresiaTx.commit(token) — un atacante no puede fabricar un
   token_ws válido sin haber pasado por el flujo real de pago.
======================================================= */
export const confirmarPagoMembresia = async (req, res) => {
  const token = req.body?.token_ws || req.query?.token_ws;
  const tokenAbortado = req.body?.TBK_TOKEN || req.query?.TBK_TOKEN;

  const redirigir = (slug, params) => {
    const qs = new URLSearchParams(params).toString();
    const destino = slug ? `${FRONTEND_URL}/${slug}/admin/mi-plan` : FRONTEND_URL;
    return res.redirect(`${destino}?${qs}`);
  };

  let transaccionEnCurso = null;

  try {
    // El cliente cerró/abortó el formulario de pago en la página de Transbank
    if (tokenAbortado) {
      const transaccion = await TransaccionMembresiaClase.findOneAndUpdate(
        { token: tokenAbortado },
        { estado: "cancelado" },
        { new: true },
      );
      return redirigir(transaccion?.empresaSlug, { pago: "cancelado" });
    }

    if (!token) {
      return redirigir(null, { pago: "error" });
    }

    const transaccion = await TransaccionMembresiaClase.findOne({ token });
    if (!transaccion) {
      return redirigir(null, { pago: "error" });
    }
    transaccionEnCurso = transaccion;

    // Idempotencia: si este callback ya se procesó antes para este pago
    // (reintento de Transbank, el cliente recarga la página de resultado),
    // no crear una segunda mensualidad — se manda al mismo resultado.
    if (transaccion.estado === "aprobado" && transaccion.membresia) {
      return redirigir(transaccion.empresaSlug, {
        pago: "exitoso",
        membresiaId: transaccion.membresia.toString(),
      });
    }

    const result = await webpayMembresiaTx.commit(token);

    if (result.response_code !== 0 || result.status !== "AUTHORIZED") {
      transaccion.estado = "rechazado";
      transaccion.respuestaTransbank = result;
      await transaccion.save();
      return redirigir(transaccion.empresaSlug, { pago: "rechazado" });
    }

    // Por si el cliente alcanzó a pagar dos veces en paralelo (dos
    // pestañas): no duplicar la mensualidad si ya quedó una activa.
    const membresiaActivaExistente = await MembresiaClase.findOne({
      empresa: transaccion.empresa,
      cliente: transaccion.cliente,
      activa: true,
    });

    if (membresiaActivaExistente) {
      transaccion.estado = "aprobado";
      transaccion.respuestaTransbank = result;
      transaccion.membresia = membresiaActivaExistente._id;
      await transaccion.save();
      return redirigir(transaccion.empresaSlug, {
        pago: "exitoso",
        membresiaId: membresiaActivaExistente._id.toString(),
      });
    }

    const fechaInicio = new Date();
    const fechaFin = new Date();
    fechaFin.setDate(fechaFin.getDate() + (transaccion.duracionDiasSnapshot || 30));

    const nuevaMembresia = await MembresiaClase.create({
      empresa: transaccion.empresa,
      cliente: transaccion.cliente,
      plan: transaccion.plan,
      nombrePlan: transaccion.nombrePlanSnapshot,
      clasesIncluidas: transaccion.clasesIncluidasSnapshot,
      tipoCiclo: transaccion.tipoCicloSnapshot,
      precio: transaccion.monto,
      activa: true,
      fechaInicio,
      fechaFin,
    });

    transaccion.estado = "aprobado";
    transaccion.respuestaTransbank = result;
    transaccion.membresia = nuevaMembresia._id;
    await transaccion.save();

    return redirigir(transaccion.empresaSlug, {
      pago: "exitoso",
      membresiaId: nuevaMembresia._id.toString(),
    });
  } catch (error) {
    console.error("❌ Error confirmarPagoMembresia:", error);
    try {
      if (token) {
        await TransaccionMembresiaClase.findOneAndUpdate(
          { token },
          { estado: "error", error: error.message },
        );
      }
    } catch (_) {
      // no dejar que un error al loguear tape el error original
    }
    return redirigir(transaccionEnCurso?.empresaSlug, { pago: "error" });
  }
};
