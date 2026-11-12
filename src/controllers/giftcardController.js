// controllers/giftcardController.js
//
// Giftcards: el cliente la pide desde la página del negocio (transferencia +
// comprobante), el admin la aprueba y se le envía por correo con un link.
// El admin también puede crearlas directo cuando la venden en el local.
import mongoose from "mongoose";
import cloudinary from "../config/cloudinary.js";
import GiftCard from "../models/giftCard.model.js";
import Empresa from "../models/empresa.model.js";
import Servicio from "../models/servicio.model.js";
import Reserva from "../models/reserva.model.js";
import {
  calcularVencimiento,
  configGiftcards,
  generarCodigoGiftcard,
  normalizarCodigoGiftcard,
  resumenGiftcard,
  ESTADOS_QUE_NO_CUENTAN,
  CONFIG_GIFTCARDS_DEFECTO,
} from "../utils/giftcards.js";
import {
  correoGiftcardActiva,
  correoNuevaSolicitudLocal,
  correoSolicitudRechazada,
  correoSolicitudRecibida,
} from "../services/giftcards/correos.js";

const EMAIL_RE = /^[^\s@<>"'()]+@[^\s@<>"'()]+\.[^\s@<>"'()]+$/;
const texto = (v, max) => String(v ?? "").trim().slice(0, max);

const subirComprobante = (buffer) =>
  new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder: "comprobantesGiftcard", resource_type: "auto" }, (error, result) =>
        error ? reject(error) : resolve(result),
      )
      .end(buffer);
  });

const empresaPublica = async (slug) => {
  const empresa = await Empresa.findOne({ slug });
  if (!empresa || empresa.estado === "inactivo") return null;
  return empresa;
};

const precioActual = (servicio) =>
  Math.round(
    servicio.calcularPrecioFinal ? servicio.calcularPrecioFinal(new Date()) : Number(servicio.precio || 0),
  );

/** Servicios que se pueden regalar (activos y con precio). */
const serviciosRegalables = async (empresaId) => {
  const servicios = await Servicio.find({ empresa: empresaId, activo: { $ne: false } }).sort({ nombre: 1 });
  return servicios
    .map((s) => ({ _id: s._id, nombre: s.nombre, precio: precioActual(s) }))
    .filter((s) => s.precio > 0);
};

/**
 * Lee y valida lo que se regala + los datos de las personas.
 * Devuelve { datos } o { error }.
 */
const leerDatosGiftcard = async (empresa, body, { exigirComprador = true } = {}) => {
  const cfg = configGiftcards(empresa);
  const tipo = body.tipo === "monto" ? "monto" : "servicio";
  let servicio = null;
  let servicioNombre = "";
  let monto = 0;

  if (tipo === "servicio") {
    if (!cfg.permitirServicio) return { error: "Este negocio no ofrece giftcards por servicio" };
    if (!mongoose.isValidObjectId(body.servicioId)) return { error: "Elige el servicio que quieres regalar" };
    const s = await Servicio.findOne({ _id: body.servicioId, empresa: empresa._id, activo: { $ne: false } });
    if (!s) return { error: "El servicio ya no está disponible" };
    servicio = s._id;
    servicioNombre = s.nombre;
    monto = precioActual(s);
    if (!(monto > 0)) return { error: "Ese servicio no se puede regalar" };
  } else {
    if (!cfg.permitirMonto) return { error: "Este negocio no ofrece giftcards por monto" };
    monto = Math.round(Number(String(body.monto ?? "").replace(/\D/g, "")));
    if (!(monto >= cfg.montoMinimo) || monto > cfg.montoMaximo) {
      return {
        error: `El monto debe estar entre $${cfg.montoMinimo.toLocaleString("es-CL")} y $${cfg.montoMaximo.toLocaleString("es-CL")}`,
      };
    }
  }

  const comprador = {
    nombre: texto(body.compradorNombre, 80),
    email: texto(body.compradorEmail, 120).toLowerCase(),
    telefono: texto(body.compradorTelefono, 30),
  };
  const destinatario = {
    nombre: texto(body.destinatarioNombre, 80),
    email: texto(body.destinatarioEmail, 120).toLowerCase(),
  };
  if (exigirComprador) {
    if (!comprador.nombre) return { error: "Escribe tu nombre" };
    if (!EMAIL_RE.test(comprador.email)) return { error: "Escribe un correo válido para enviarte la giftcard" };
  } else if (comprador.email && !EMAIL_RE.test(comprador.email)) {
    return { error: "El correo de quien compra no es válido" };
  }
  if (!destinatario.nombre) return { error: "Escribe para quién es la giftcard" };
  if (destinatario.email && !EMAIL_RE.test(destinatario.email)) {
    return { error: "El correo de quien la recibe no es válido" };
  }

  return {
    datos: {
      tipo,
      servicio,
      servicioNombre,
      monto,
      comprador,
      destinatario,
      de: texto(body.de, 80) || comprador.nombre,
      mensaje: texto(body.mensaje, 300),
    },
  };
};

/** Activa una giftcard: código único + vencimiento. */
const activar = async (gc, empresa, adminId) => {
  const cfg = configGiftcards(empresa);
  for (let intento = 0; intento < 5; intento += 1) {
    gc.codigo = generarCodigoGiftcard();
    gc.estado = "activa";
    gc.venceEn = calcularVencimiento(cfg.mesesVigencia);
    gc.aprobadaEn = new Date();
    gc.aprobadaPor = adminId || null;
    try {
      await gc.save();
      return gc;
    } catch (e) {
      if (e?.code !== 11000) throw e; // código repetido: se genera otro
    }
  }
  throw new Error("No se pudo generar un código único");
};

const enviarGiftcard = async (empresa, gc) => {
  const resultados = await correoGiftcardActiva(empresa, gc);
  const algunoOk = (resultados || []).some((r) => r.status === "fulfilled" && !r.value?.error);
  if (algunoOk) await GiftCard.updateOne({ _id: gc._id }, { $set: { correoEnviadoEn: new Date() } });
  return algunoOk;
};

/** Lo que ve el admin de cada giftcard. */
const paraPanel = (gc, usos = []) => {
  const r = resumenGiftcard(gc, usos);
  return { ...(gc.toObject ? gc.toObject() : gc), estadoActual: r.estado, saldo: r.saldo, usado: r.usado, cantidadUsos: r.usos };
};

/* =====================================================
   PÚBLICO
===================================================== */

// GET /giftcards/publico/:slug — lo necesario para la página "Regalar"
export const configPublica = async (req, res) => {
  try {
    const empresa = await empresaPublica(req.params.slug);
    if (!empresa) return res.status(404).json({ message: "Negocio no encontrado" });
    const cfg = configGiftcards(empresa);
    if (!cfg.activa) return res.json({ activa: false });

    const t = empresa.pagos?.transferencia || {};
    return res.json({
      activa: true,
      permitirServicio: cfg.permitirServicio,
      permitirMonto: cfg.permitirMonto,
      montoMinimo: cfg.montoMinimo,
      montoMaximo: cfg.montoMaximo,
      mesesVigencia: cfg.mesesVigencia,
      instrucciones: cfg.instrucciones,
      servicios: cfg.permitirServicio ? await serviciosRegalables(empresa._id) : [],
      transferencia: {
        banco: t.banco || "",
        tipoCuenta: t.tipoCuenta || "",
        numeroCuenta: t.numeroCuenta || "",
        titular: t.titular || "",
        rut: t.rut || "",
        correo: t.correo || "",
      },
    });
  } catch (error) {
    console.error("❌ configPublica giftcards:", error);
    return res.status(500).json({ message: "No se pudo cargar la información" });
  }
};

// POST /giftcards/publico/:slug/solicitud  (multipart, campo "comprobante")
export const crearSolicitudPublica = async (req, res) => {
  try {
    const empresa = await empresaPublica(req.params.slug);
    if (!empresa) return res.status(404).json({ message: "Negocio no encontrado" });
    if (!configGiftcards(empresa).activa) {
      return res.status(403).json({ message: "Este negocio no está vendiendo giftcards por ahora" });
    }

    const { datos, error } = await leerDatosGiftcard(empresa, req.body);
    if (error) return res.status(400).json({ message: error });

    if (!req.file?.buffer) return res.status(400).json({ message: "Sube el comprobante de la transferencia" });
    if (req.file.size > 8 * 1024 * 1024) return res.status(400).json({ message: "El comprobante no puede pesar más de 8 MB" });
    const tipoOk = /^image\//.test(req.file.mimetype) || req.file.mimetype === "application/pdf";
    if (!tipoOk) return res.status(400).json({ message: "El comprobante debe ser una imagen o un PDF" });

    let comprobante;
    try {
      const subido = await subirComprobante(req.file.buffer);
      comprobante = { url: subido.secure_url, publicId: subido.public_id };
    } catch (e) {
      console.error("❌ Comprobante giftcard a Cloudinary:", e);
      return res.status(502).json({ message: "No se pudo subir el comprobante, intenta de nuevo" });
    }

    const gc = await GiftCard.create({
      ...datos,
      empresa: empresa._id,
      estado: "pendiente",
      origen: "web",
      pago: { metodo: "transferencia", comprobante },
    });

    res.status(201).json({ ok: true, id: gc._id });

    Promise.allSettled([correoSolicitudRecibida(empresa, gc), correoNuevaSolicitudLocal(empresa, gc)]).catch(() => {});
  } catch (error) {
    console.error("❌ crearSolicitudPublica giftcard:", error);
    if (!res.headersSent) res.status(500).json({ message: "No se pudo enviar la solicitud" });
  }
};

// GET /giftcards/publico/:slug/tarjeta/:codigo — la giftcard para mostrar
export const verTarjetaPublica = async (req, res) => {
  try {
    const empresa = await empresaPublica(req.params.slug);
    if (!empresa) return res.status(404).json({ message: "Negocio no encontrado" });
    const codigo = normalizarCodigoGiftcard(req.params.codigo);
    const gc = codigo ? await GiftCard.findOne({ empresa: empresa._id, codigo }).lean() : null;
    if (!gc || ["pendiente", "rechazada"].includes(gc.estado)) {
      return res.status(404).json({ message: "No encontramos esta giftcard" });
    }
    const usos = await Reserva.find({ "giftcard.giftcardId": gc._id, estado: { $nin: ESTADOS_QUE_NO_CUENTAN } })
      .select("giftcard")
      .lean();
    const r = resumenGiftcard(gc, usos);
    return res.json({
      codigo: gc.codigo,
      tipo: gc.tipo,
      servicioNombre: gc.servicioNombre,
      monto: gc.monto,
      saldo: r.saldo,
      estado: r.estado,
      venceEn: gc.venceEn,
      para: gc.destinatario?.nombre || "",
      de: gc.de || "",
      mensaje: gc.mensaje || "",
    });
  } catch (error) {
    console.error("❌ verTarjetaPublica:", error);
    return res.status(500).json({ message: "No se pudo cargar la giftcard" });
  }
};

/* =====================================================
   PANEL (solo admin)
===================================================== */

// GET /giftcards?estado=pendiente|activa|usada|vencida|rechazada|anulada|todas
export const listarGiftcards = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const giftcards = await GiftCard.find({ empresa: empresaId }).sort({ createdAt: -1 }).limit(1000).lean();

    const ids = giftcards.filter((g) => g.estado === "activa").map((g) => g._id);
    const reservas = ids.length
      ? await Reserva.find({ "giftcard.giftcardId": { $in: ids }, estado: { $nin: ESTADOS_QUE_NO_CUENTAN } })
          .select("giftcard fecha")
          .lean()
      : [];
    const usosPor = new Map();
    for (const r of reservas) {
      const k = String(r.giftcard.giftcardId);
      if (!usosPor.has(k)) usosPor.set(k, []);
      usosPor.get(k).push(r);
    }

    const todas = giftcards.map((g) => paraPanel(g, usosPor.get(String(g._id)) || []));
    const cuenta = (e) => todas.filter((g) => g.estadoActual === e).length;
    const resumen = {
      pendientes: cuenta("pendiente"),
      activas: cuenta("activa"),
      usadas: cuenta("usada"),
      vencidas: cuenta("vencida"),
      vendido: todas
        .filter((g) => ["activa", "usada", "vencida"].includes(g.estadoActual))
        .reduce((s, g) => s + (Number(g.monto) || 0), 0),
      saldoPorUsar: todas.filter((g) => g.estadoActual === "activa").reduce((s, g) => s + g.saldo, 0),
    };

    const estado = String(req.query.estado || "todas");
    const items = estado === "todas" ? todas : todas.filter((g) => g.estadoActual === estado);
    return res.json({ items, resumen });
  } catch (error) {
    console.error("❌ listarGiftcards:", error);
    return res.status(500).json({ message: "No se pudieron cargar las giftcards" });
  }
};

const buscarDelNegocio = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ message: "Giftcard inválida" });
    return null;
  }
  const gc = await GiftCard.findOne({ _id: req.params.id, empresa: req.usuario.empresaId });
  if (!gc) res.status(404).json({ message: "Giftcard no encontrada" });
  return gc;
};

// GET /giftcards/:id — detalle con las reservas donde se usó
export const detalleGiftcard = async (req, res) => {
  try {
    const gc = await buscarDelNegocio(req, res);
    if (!gc) return undefined;
    const reservas = await Reserva.find({ "giftcard.giftcardId": gc._id })
      .sort({ fecha: 1 })
      .populate("cliente", "nombre apellido")
      .populate("barbero", "nombre apellido")
      .select("fecha estado giftcard servicioSnapshot cliente barbero")
      .lean();
    const cuentan = reservas.filter((r) => !ESTADOS_QUE_NO_CUENTAN.includes(r.estado));
    return res.json({
      giftcard: paraPanel(gc, cuentan),
      usos: reservas.map((r) => ({
        _id: r._id,
        fecha: r.fecha,
        estado: r.estado,
        cuenta: !ESTADOS_QUE_NO_CUENTAN.includes(r.estado),
        servicio: r.servicioSnapshot?.nombre || "",
        montoAplicado: r.giftcard?.montoAplicado || 0,
        cliente: r.cliente ? `${r.cliente.nombre || ""} ${r.cliente.apellido || ""}`.trim() : "",
        barbero: r.barbero ? `${r.barbero.nombre || ""} ${r.barbero.apellido || ""}`.trim() : "",
      })),
    });
  } catch (error) {
    console.error("❌ detalleGiftcard:", error);
    return res.status(500).json({ message: "No se pudo cargar la giftcard" });
  }
};

// POST /giftcards — venta en el local: queda activa altiro
export const crearGiftcardPanel = async (req, res) => {
  try {
    const empresa = await Empresa.findById(req.usuario.empresaId);
    if (!empresa) return res.status(404).json({ message: "Negocio no encontrado" });
    const { datos, error } = await leerDatosGiftcard(empresa, req.body, { exigirComprador: false });
    if (error) return res.status(400).json({ message: error });

    const metodo = ["transferencia", "efectivo", "otro"].includes(req.body.metodo) ? req.body.metodo : "efectivo";
    const gc = new GiftCard({ ...datos, empresa: empresa._id, origen: "panel", pago: { metodo } });
    await activar(gc, empresa, req.usuario.id);
    const correo = datos.comprador.email || datos.destinatario.email ? await enviarGiftcard(empresa, gc) : false;
    return res.status(201).json({ ok: true, giftcard: paraPanel(gc), correoEnviado: correo });
  } catch (error) {
    console.error("❌ crearGiftcardPanel:", error);
    return res.status(500).json({ message: "No se pudo crear la giftcard" });
  }
};

// PATCH /giftcards/:id/aprobar
export const aprobarGiftcard = async (req, res) => {
  try {
    const gc = await buscarDelNegocio(req, res);
    if (!gc) return undefined;
    if (gc.estado !== "pendiente") return res.status(409).json({ message: "Esta solicitud ya fue revisada" });
    const empresa = await Empresa.findById(req.usuario.empresaId);
    await activar(gc, empresa, req.usuario.id);
    const correo = await enviarGiftcard(empresa, gc);
    return res.json({ ok: true, giftcard: paraPanel(gc), correoEnviado: correo });
  } catch (error) {
    console.error("❌ aprobarGiftcard:", error);
    return res.status(500).json({ message: "No se pudo aprobar la giftcard" });
  }
};

// PATCH /giftcards/:id/rechazar { motivo }
export const rechazarGiftcard = async (req, res) => {
  try {
    const gc = await buscarDelNegocio(req, res);
    if (!gc) return undefined;
    if (gc.estado !== "pendiente") return res.status(409).json({ message: "Esta solicitud ya fue revisada" });
    gc.estado = "rechazada";
    gc.rechazo = { motivo: texto(req.body?.motivo, 200), fecha: new Date(), por: req.usuario.id };
    await gc.save();
    const empresa = await Empresa.findById(req.usuario.empresaId);
    Promise.resolve(correoSolicitudRechazada(empresa, gc)).catch((e) => console.error("❌ correo rechazo giftcard:", e));
    return res.json({ ok: true, giftcard: paraPanel(gc) });
  } catch (error) {
    console.error("❌ rechazarGiftcard:", error);
    return res.status(500).json({ message: "No se pudo rechazar la giftcard" });
  }
};

// PATCH /giftcards/:id/anular — deja de servir (las reservas ya hechas se mantienen)
export const anularGiftcard = async (req, res) => {
  try {
    const gc = await buscarDelNegocio(req, res);
    if (!gc) return undefined;
    if (gc.estado !== "activa") return res.status(409).json({ message: "Solo se puede anular una giftcard activa" });
    gc.estado = "anulada";
    gc.anuladaEn = new Date();
    gc.anuladaPor = req.usuario.id;
    await gc.save();
    return res.json({ ok: true, giftcard: paraPanel(gc) });
  } catch (error) {
    console.error("❌ anularGiftcard:", error);
    return res.status(500).json({ message: "No se pudo anular la giftcard" });
  }
};

// POST /giftcards/:id/reenviar — vuelve a mandar el correo
export const reenviarGiftcard = async (req, res) => {
  try {
    const gc = await buscarDelNegocio(req, res);
    if (!gc) return undefined;
    if (gc.estado !== "activa") return res.status(409).json({ message: "La giftcard no está activa" });
    if (!gc.comprador?.email && !gc.destinatario?.email) {
      return res.status(400).json({ message: "Esta giftcard no tiene correos registrados" });
    }
    const empresa = await Empresa.findById(req.usuario.empresaId);
    const ok = await enviarGiftcard(empresa, gc);
    return ok ? res.json({ ok: true }) : res.status(502).json({ message: "No se pudo enviar el correo" });
  } catch (error) {
    console.error("❌ reenviarGiftcard:", error);
    return res.status(500).json({ message: "No se pudo reenviar la giftcard" });
  }
};

// GET /giftcards/configuracion
export const getConfiguracion = async (req, res) => {
  try {
    const empresa = await Empresa.findById(req.usuario.empresaId).select("giftcards pagos.transferencia slug");
    const t = empresa?.pagos?.transferencia || {};
    return res.json({
      configuracion: configGiftcards(empresa),
      transferenciaLista: !!(t.banco && t.numeroCuenta && t.titular),
      slug: empresa?.slug,
      // para "Nueva giftcard" (venta en el local)
      servicios: empresa ? await serviciosRegalables(empresa._id) : [],
    });
  } catch (error) {
    console.error("❌ getConfiguracion giftcards:", error);
    return res.status(500).json({ message: "No se pudo cargar la configuración" });
  }
};

// PUT /giftcards/configuracion
export const putConfiguracion = async (req, res) => {
  try {
    const b = req.body || {};
    const num = (v, def, min, max) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
    };
    const d = CONFIG_GIFTCARDS_DEFECTO;
    const cfg = {
      activa: b.activa === true,
      permitirServicio: b.permitirServicio !== false,
      permitirMonto: b.permitirMonto !== false,
      montoMinimo: num(b.montoMinimo, d.montoMinimo, 1000, 10000000),
      montoMaximo: num(b.montoMaximo, d.montoMaximo, 1000, 10000000),
      mesesVigencia: num(b.mesesVigencia, d.mesesVigencia, 1, 36),
      instrucciones: texto(b.instrucciones, 300),
    };
    if (!cfg.permitirServicio && !cfg.permitirMonto) {
      return res.status(400).json({ message: "Deja al menos una opción: por servicio o por monto" });
    }
    if (cfg.montoMaximo < cfg.montoMinimo) {
      return res.status(400).json({ message: "El monto máximo no puede ser menor que el mínimo" });
    }
    await Empresa.updateOne({ _id: req.usuario.empresaId }, { $set: { giftcards: cfg } });
    return res.json({ ok: true, configuracion: cfg });
  } catch (error) {
    console.error("❌ putConfiguracion giftcards:", error);
    return res.status(500).json({ message: "No se pudo guardar la configuración" });
  }
};
