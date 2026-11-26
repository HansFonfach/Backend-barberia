// controllers/planSaasController.js
//
// Mensualidad de AgendaFonfach pagada online con Mercado Pago.
//
// Todo funciona con el "link de pago" del negocio (utils/linkPagoPlan.js),
// así sirve también cuando el negocio está suspendido y no puede entrar:
//   GET  /plan-saas/mi-plan                 (admin con sesión) → plan + token
//   GET  /plan-saas/link/:token             → datos del plan
//   POST /plan-saas/link/:token/pagar       → URL de Checkout Pro (pago de 1 mes)
//   POST /plan-saas/link/:token/verificar   → revisa si el pago ya se acreditó
//   POST /plan-saas/link/:token/automatico  → URL para activar el pago automático
//   POST /plan-saas/link/:token/automatico/verificar
//   POST /plan-saas/link/:token/automatico/cancelar
//   POST /webhook/mercadopago               → avisos de Mercado Pago
//
// Cuando un pago se confirma se usa la misma lógica que "Marcar pago" del
// super-admin (services/pagosEmpresa.js).
import Empresa from "../models/empresa.model.js";
import CobroOnlineEmpresa from "../models/cobroOnlineEmpresa.model.js";
import { aplicarPagoEmpresa } from "../services/pagosEmpresa.js";
import {
  ErrorMercadoPago,
  cancelarSuscripcion,
  crearOrdenCheckout,
  crearSuscripcion,
  mercadoPagoConfigurado,
  obtenerOrden,
  obtenerPagoAutorizado,
  obtenerSuscripcion,
  ordenPagada,
  pagoAutorizadoAprobado,
} from "../services/mercadoPago/api.js";
import { firmaWebhookValida } from "../services/mercadoPago/firma.js";
import { crearTokenPago, leerTokenPago, linkPagoPlan, urlFrontend } from "../utils/linkPagoPlan.js";

const esEmailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e || "");
const CAMPOS_PLAN =
  "nombre slug logo correo cuotaMensual proximoPago ultimoPago estado estadoSuscripcion trial historialPagos pagoAutomatico";

const urlWebhook = () => {
  const base = (process.env.BACKEND_URL || "").replace(/\/+$/, "");
  return base ? `${base}/webhook/mercadopago` : "";
};

const responderError = (res, error, accion) => {
  if (error instanceof ErrorMercadoPago) {
    console.error(`❌ Mercado Pago (${accion}):`, error.status, error.message, JSON.stringify(error.detalle || {}).slice(0, 600));
    return res.status(502).json({ message: `Mercado Pago respondió: ${error.message}` });
  }
  if (!error.status) console.error(`❌ Plan SaaS (${accion}):`, error);
  return res.status(error.status || 500).json({ message: error.status ? error.message : "No se pudo completar la operación" });
};

// Datos del plan que ve el negocio (nunca datos de otros negocios)
const plan = (e) => ({
  negocio: { nombre: e.nombre, slug: e.slug, logo: e.logo || null },
  cuotaMensual: e.cuotaMensual || 0,
  proximoPago: e.proximoPago || null,
  ultimoPago: e.ultimoPago || null,
  estadoSuscripcion: e.estadoSuscripcion,
  finPrueba: e.estadoSuscripcion === "trial" ? e.trial?.fin || null : null,
  pagoAutomatico: {
    estado: e.pagoAutomatico?.estado || "inactivo",
    email: e.pagoAutomatico?.email || "",
  },
  correoSugerido: e.correo || "",
  pagosRecientes: [...(e.historialPagos || [])]
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, 5)
    .map((p) => ({ fecha: p.fecha, monto: p.monto })),
  mercadoPagoDisponible: mercadoPagoConfigurado(),
});

const empresaDelToken = async (req) => {
  const id = leerTokenPago(req.params.token);
  if (!id) {
    const e = new Error("El link de pago no es válido o venció. Pide uno nuevo.");
    e.status = 404;
    throw e;
  }
  const empresa = await Empresa.findById(id).select(CAMPOS_PLAN);
  if (!empresa || empresa.estado === "inactivo") {
    const e = new Error("Este negocio no está disponible.");
    e.status = 404;
    throw e;
  }
  return empresa;
};

/* ───────── Aplicar un pago confirmado (una sola vez) ───────── */
const aplicarCobro = async (cobro, notas) => {
  // Paso atómico: solo el primero que llega (webhook o vuelta) lo aplica
  const tomado = await CobroOnlineEmpresa.findOneAndUpdate(
    { _id: cobro._id, estado: { $in: ["pendiente", "rechazado"] } },
    { $set: { estado: "pagado", aplicadoEn: new Date() } },
    { new: true },
  );
  if (!tomado) return false;
  try {
    await aplicarPagoEmpresa(cobro.empresa, { monto: cobro.monto, notas, metodo: "mercadopago" });
    return true;
  } catch (e) {
    console.error("❌ No se pudo aplicar el pago online:", e.message);
    await CobroOnlineEmpresa.updateOne({ _id: cobro._id }, { $set: { estado: "error", detalle: e.message } });
    return false;
  }
};

const revisarOrden = async (cobro) => {
  const orden = await obtenerOrden(cobro.ordenId);
  if (ordenPagada(orden)) {
    await aplicarCobro(cobro, `Mercado Pago · orden ${cobro.ordenId}`);
    return "pagado";
  }
  if (["canceled", "cancelled", "expired", "failed"].includes(orden?.status)) {
    await CobroOnlineEmpresa.updateOne({ _id: cobro._id, estado: "pendiente" }, { $set: { estado: "rechazado", detalle: orden.status } });
    return "rechazado";
  }
  return "pendiente";
};

/* ───────── Endpoints ───────── */

// Admin con sesión: su plan y su link de pago
export const miPlan = async (req, res) => {
  try {
    const empresa = await Empresa.findById(req.usuario.empresaId).select(CAMPOS_PLAN);
    if (!empresa) return res.status(404).json({ message: "Negocio no encontrado" });
    return res.json({ ...plan(empresa), token: crearTokenPago(empresa._id) });
  } catch (error) {
    return responderError(res, error, "mi-plan");
  }
};

export const verPlan = async (req, res) => {
  try {
    const empresa = await empresaDelToken(req);
    return res.json(plan(empresa));
  } catch (error) {
    return responderError(res, error, "ver plan");
  }
};

export const pagarMes = async (req, res) => {
  try {
    if (!mercadoPagoConfigurado()) return res.status(503).json({ message: "El pago online aún no está disponible." });
    const empresa = await empresaDelToken(req);
    const monto = Math.round(Number(empresa.cuotaMensual) || 0);
    if (monto < 50) {
      return res.status(400).json({ message: "Tu plan todavía no tiene un monto asignado. Escríbenos y lo dejamos listo." });
    }

    const cobro = await CobroOnlineEmpresa.create({ empresa: empresa._id, tipo: "pago_unico", monto });
    const volver = `${urlFrontend()}/pagar-plan/${req.params.token}`;
    try {
      const orden = await crearOrdenCheckout({
        total: monto,
        titulo: "Plan mensual AgendaFonfach",
        descripcion: `Mensualidad AgendaFonfach · ${empresa.nombre}`,
        // Solo letras, números, - y _ (lo exige la API de Orders)
        referencia: `plan-${empresa._id}-${cobro._id}`,
        email: esEmailValido(req.body?.email) ? req.body.email.trim().toLowerCase() : undefined,
        urls: { exito: `${volver}?retorno=pago`, fallo: `${volver}?retorno=fallo`, pendiente: `${volver}?retorno=pago`, webhook: urlWebhook() },
        idempotencia: `plan-${cobro._id}`,
      });
      if (!orden?.id || !orden?.checkout_url) throw new ErrorMercadoPago("No devolvió el link de pago", 502, orden);
      cobro.ordenId = orden.id;
      await cobro.save();
      return res.json({ url: orden.checkout_url });
    } catch (e) {
      await CobroOnlineEmpresa.deleteOne({ _id: cobro._id });
      throw e;
    }
  } catch (error) {
    return responderError(res, error, "pagar mes");
  }
};

// Al volver de Mercado Pago: revisa los cobros pendientes recientes del negocio
export const verificarPago = async (req, res) => {
  try {
    const empresa = await empresaDelToken(req);
    const desde = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const cobros = await CobroOnlineEmpresa.find({
      empresa: empresa._id,
      tipo: "pago_unico",
      ordenId: { $type: "string" },
      createdAt: { $gte: desde },
      estado: { $in: ["pendiente", "pagado"] },
    })
      .sort({ createdAt: -1 })
      .limit(5);

    let resultado = "sin_pago";
    for (const cobro of cobros) {
      if (cobro.estado === "pagado") {
        resultado = "pagado";
        break;
      }
      const estado = await revisarOrden(cobro);
      if (estado === "pagado") {
        resultado = "pagado";
        break;
      }
      if (estado === "pendiente") resultado = "pendiente";
    }
    const actualizada = await Empresa.findById(empresa._id).select(CAMPOS_PLAN);
    return res.json({ resultado, plan: plan(actualizada) });
  } catch (error) {
    return responderError(res, error, "verificar pago");
  }
};

export const activarAutomatico = async (req, res) => {
  try {
    if (!mercadoPagoConfigurado()) return res.status(503).json({ message: "El pago online aún no está disponible." });
    const empresa = await empresaDelToken(req);
    const monto = Math.round(Number(empresa.cuotaMensual) || 0);
    if (monto < 50) {
      return res.status(400).json({ message: "Tu plan todavía no tiene un monto asignado. Escríbenos y lo dejamos listo." });
    }
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!esEmailValido(email)) {
      return res.status(400).json({ message: "Escribe el correo de tu cuenta de Mercado Pago" });
    }

    // Si ya está pagado hasta una fecha futura, el primer cobro automático es ese día
    const inicio = empresa.proximoPago && new Date(empresa.proximoPago) > new Date(Date.now() + 60 * 60 * 1000) ? empresa.proximoPago : null;
    const suscripcion = await crearSuscripcion({
      monto,
      motivo: `AgendaFonfach · Plan mensual · ${empresa.nombre}`.slice(0, 200),
      referencia: String(empresa._id),
      email,
      urlRetorno: `${urlFrontend()}/pagar-plan/${req.params.token}?retorno=automatico`,
      inicio,
    });
    if (!suscripcion?.id || !suscripcion?.init_point) throw new ErrorMercadoPago("No devolvió el link de la suscripción", 502, suscripcion);

    empresa.pagoAutomatico = {
      proveedor: "mercadopago",
      suscripcionId: suscripcion.id,
      estado: "pendiente",
      email,
      actualizadoEn: new Date(),
    };
    await empresa.save();
    return res.json({ url: suscripcion.init_point });
  } catch (error) {
    return responderError(res, error, "activar automático");
  }
};

const sincronizarSuscripcion = async (empresa) => {
  const id = empresa.pagoAutomatico?.suscripcionId;
  if (!id) return empresa;
  const s = await obtenerSuscripcion(id);
  const estados = { authorized: "activo", pending: "pendiente", paused: "pausado", cancelled: "cancelado" };
  empresa.pagoAutomatico.estado = estados[s?.status] || empresa.pagoAutomatico.estado;
  empresa.pagoAutomatico.actualizadoEn = new Date();
  empresa.markModified("pagoAutomatico");
  await empresa.save();
  return empresa;
};

export const verificarAutomatico = async (req, res) => {
  try {
    const empresa = await empresaDelToken(req);
    await sincronizarSuscripcion(empresa);
    return res.json({ plan: plan(empresa) });
  } catch (error) {
    return responderError(res, error, "verificar automático");
  }
};

export const cancelarAutomatico = async (req, res) => {
  try {
    const empresa = await empresaDelToken(req);
    const id = empresa.pagoAutomatico?.suscripcionId;
    if (!id) return res.status(400).json({ message: "No tienes pago automático activo" });
    await cancelarSuscripcion(id);
    empresa.pagoAutomatico.estado = "cancelado";
    empresa.pagoAutomatico.actualizadoEn = new Date();
    empresa.markModified("pagoAutomatico");
    await empresa.save();
    return res.json({ plan: plan(empresa) });
  } catch (error) {
    return responderError(res, error, "cancelar automático");
  }
};

/* ───────── Webhook de Mercado Pago ───────── */
export const webhookMercadoPago = async (req, res) => {
  const tipo = req.body?.type || req.query?.type || req.query?.topic || "";
  const dataId = String(req.query?.["data.id"] || req.body?.data?.id || req.query?.id || "");

  const secreto = process.env.MP_WEBHOOK_SECRET;
  if (secreto) {
    const valida = firmaWebhookValida({
      xSignature: req.headers["x-signature"],
      xRequestId: req.headers["x-request-id"],
      dataId,
      secreto,
    });
    if (!valida) return res.status(401).end();
  }

  // Se responde altiro (Mercado Pago reintenta si tardamos) y se procesa después
  res.status(200).end();
  if (!dataId || !mercadoPagoConfigurado()) return;

  try {
    if (tipo === "order") {
      const cobro = await CobroOnlineEmpresa.findOne({ ordenId: dataId });
      if (cobro && cobro.estado !== "pagado") await revisarOrden(cobro);
      return;
    }

    if (tipo === "subscription_preapproval") {
      const empresa = await Empresa.findOne({ "pagoAutomatico.suscripcionId": dataId }).select(CAMPOS_PLAN);
      if (empresa) await sincronizarSuscripcion(empresa);
      return;
    }

    if (tipo === "subscription_authorized_payment") {
      const pago = await obtenerPagoAutorizado(dataId);
      if (!pagoAutorizadoAprobado(pago)) return;
      const empresa = await Empresa.findOne({ "pagoAutomatico.suscripcionId": String(pago.preapproval_id) }).select("_id cuotaMensual");
      if (!empresa) return;
      let cobro = await CobroOnlineEmpresa.findOne({ pagoAutorizadoId: String(pago.id) });
      if (!cobro) {
        try {
          cobro = await CobroOnlineEmpresa.create({
            empresa: empresa._id,
            tipo: "automatico",
            pagoAutorizadoId: String(pago.id),
            suscripcionId: String(pago.preapproval_id),
            monto: Math.round(Number(pago.transaction_amount) || empresa.cuotaMensual || 0),
          });
        } catch (e) {
          if (e?.code !== 11000) throw e; // llegó dos veces al mismo tiempo
          cobro = await CobroOnlineEmpresa.findOne({ pagoAutorizadoId: String(pago.id) });
        }
      }
      if (cobro) await aplicarCobro(cobro, `Mercado Pago · pago automático ${pago.id}`);
    }
  } catch (error) {
    console.error("❌ Webhook Mercado Pago:", tipo, dataId, error.message);
  }
};

/* ───────── Super-admin: link de pago de un negocio ───────── */
export const linkPagoParaSuperAdmin = async (req, res) => {
  try {
    const empresa = await Empresa.findById(req.params.id).select("_id nombre");
    if (!empresa) return res.status(404).json({ message: "Empresa no encontrada" });
    return res.json({ link: linkPagoPlan(empresa._id) });
  } catch (error) {
    return responderError(res, error, "link de pago");
  }
};
