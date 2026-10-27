// Clientes de reservas de mesa y promociones por correo. La empresa sale
// SIEMPRE del token (req.usuario.empresaId), nunca del body.
import Empresa from "../models/empresa.model.js";
import ClienteReservaMesa from "../models/clienteReservaMesa.model.js";
import CampanaReservaMesa from "../models/campanaReservaMesa.model.js";
import {
  listarClientes,
  contarClientes,
  cambiarPermisoPromociones,
  filtroDestinatarios,
  hayEnvioEnCurso,
  marcarInterrumpidas,
  enviarPromocionEnSegundoPlano,
  darDeBajaPorToken,
  MAX_DESTINATARIOS_POR_PROMOCION,
} from "../services/reservasMesa/clientes.js";
import { correoPromocion } from "../services/reservasMesa/correos.js";
import { esEmailValido, limpiarTexto } from "../services/reservasMesa/utilidades.js";

const fallo = (res, accion, error) => {
  console.error(`❌ Clientes de reservas de mesa (${accion}):`, error);
  return res.status(500).json({ message: "Ocurrió un error, intenta de nuevo" });
};

const actorNombre = (req) =>
  `${req.usuario.nombre || ""} ${req.usuario.apellido || ""}`.trim() || "Panel";

const empresaParaCorreo = (empresaId) =>
  Empresa.findById(empresaId).select("nombre slug telefono direccion redes").lean();

const leerPromocion = (body = {}) => {
  const asunto = limpiarTexto(body.asunto, 120);
  const mensaje = limpiarTexto(body.mensaje, 3000);
  if (asunto.length < 3) return { error: "Escribe un asunto" };
  if (mensaje.length < 10) return { error: "Escribe el mensaje de la promoción" };
  return { asunto, mensaje };
};

/* ─────────── Clientes ─────────── */

export const clientes = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const pagina = Math.max(1, Number(req.query.pagina) || 1);
    const porPagina = Math.min(100, Math.max(5, Number(req.query.porPagina) || 25));
    const [lista, resumen] = await Promise.all([
      listarClientes({ empresaId, q: req.query.q, promo: req.query.promo, pagina, porPagina }),
      contarClientes(empresaId),
    ]);
    return res.json({ ...lista, resumen });
  } catch (error) {
    return fallo(res, "listar", error);
  }
};

const celdaCsv = (v) => {
  const s = String(v ?? "");
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Planilla para abrir en Excel (separada por ";", como usa Excel en Chile). */
export const exportarClientes = async (req, res) => {
  try {
    const { items } = await listarClientes({
      empresaId: req.usuario.empresaId,
      q: req.query.q,
      promo: req.query.promo,
      pagina: 1,
      porPagina: 100000,
    });
    const filas = [
      ["Nombre", "Teléfono", "Correo", "Reservas", "Visitas", "No asistió", "Primera reserva", "Última reserva", "Acepta promociones"],
      ...items.map((c) => [
        c.nombre,
        c.telefono,
        c.email,
        c.reservas,
        c.visitas,
        c.noAsistio,
        c.primera,
        c.ultima,
        c.promociones.acepta ? "Sí" : "No",
      ]),
    ];
    const csv = `﻿${filas.map((f) => f.map(celdaCsv).join(";")).join("\r\n")}`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="clientes-reservas.csv"');
    return res.send(csv);
  } catch (error) {
    return fallo(res, "exportar", error);
  }
};

export const cambiarPromociones = async (req, res) => {
  try {
    const telefonoNormalizado = String(req.params.telefono || "").replace(/\D/g, "");
    if (!telefonoNormalizado) return res.status(400).json({ message: "Teléfono inválido" });
    const ficha = await cambiarPermisoPromociones({
      empresaId: req.usuario.empresaId,
      telefonoNormalizado,
      acepta: !!req.body?.acepta,
      actorNombre: actorNombre(req),
    });
    if (!ficha) return res.status(404).json({ message: "Cliente no encontrado" });
    return res.json({ promociones: ficha.promociones, email: ficha.email });
  } catch (error) {
    return fallo(res, "cambiar promociones", error);
  }
};

/* ─────────── Promociones ─────────── */

export const campanas = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    await marcarInterrumpidas(empresaId);
    const [lista, destinatarios] = await Promise.all([
      CampanaReservaMesa.find({ empresa: empresaId }).sort({ createdAt: -1 }).limit(20).lean(),
      ClienteReservaMesa.countDocuments(filtroDestinatarios(empresaId)),
    ]);
    return res.json({ campanas: lista, destinatarios, maximo: MAX_DESTINATARIOS_POR_PROMOCION });
  } catch (error) {
    return fallo(res, "listar promociones", error);
  }
};

export const crearCampana = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const datos = leerPromocion(req.body);
    if (datos.error) return res.status(400).json({ message: datos.error });

    if (await hayEnvioEnCurso(empresaId)) {
      return res.status(409).json({ message: "Ya hay una promoción enviándose. Espera a que termine." });
    }

    const destinatarios = await ClienteReservaMesa.find(filtroDestinatarios(empresaId))
      .select("nombre email tokenBaja")
      .limit(MAX_DESTINATARIOS_POR_PROMOCION + 1)
      .lean();
    if (destinatarios.length === 0) {
      return res.status(400).json({ message: "Todavía no hay clientes que hayan aceptado recibir promociones" });
    }
    if (destinatarios.length > MAX_DESTINATARIOS_POR_PROMOCION) {
      return res.status(400).json({
        message: `Hay más de ${MAX_DESTINATARIOS_POR_PROMOCION} destinatarios. Contáctanos para ampliar el límite de envío.`,
      });
    }

    const campana = await CampanaReservaMesa.create({
      empresa: empresaId,
      ...datos,
      creadoPor: { id: req.usuario.id, nombre: actorNombre(req) },
      destinatarios: destinatarios.length,
    });
    const empresa = await empresaParaCorreo(empresaId);
    enviarPromocionEnSegundoPlano(campana, empresa, destinatarios);
    return res.status(201).json(campana);
  } catch (error) {
    return fallo(res, "enviar promoción", error);
  }
};

export const enviarPrueba = async (req, res) => {
  try {
    const datos = leerPromocion(req.body);
    if (datos.error) return res.status(400).json({ message: datos.error });
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!esEmailValido(email)) return res.status(400).json({ message: "Ingresa un correo válido para la prueba" });

    const empresa = await empresaParaCorreo(req.usuario.empresaId);
    const ok = await correoPromocion({ nombre: req.usuario.nombre || "", email }, empresa, { ...datos, prueba: true });
    if (!ok) return res.status(502).json({ message: "No se pudo enviar el correo de prueba" });
    return res.json({ message: `Prueba enviada a ${email}` });
  } catch (error) {
    return fallo(res, "prueba de promoción", error);
  }
};

/* ─────────── Baja con el link del correo (público) ─────────── */

const ocultarCorreo = (email = "") => {
  const [u, d] = email.split("@");
  if (!d) return "";
  return `${u.slice(0, 2)}${"•".repeat(Math.max(1, u.length - 2))}@${d}`;
};

export const infoBaja = async (req, res) => {
  try {
    const token = String(req.params.token || "");
    const ficha = token.length >= 32 ? await ClienteReservaMesa.findOne({ tokenBaja: token }).lean() : null;
    if (!ficha) return res.status(404).json({ message: "El link no es válido" });
    const empresa = await Empresa.findById(ficha.empresa).select("nombre slug").lean();
    return res.json({
      empresa: { nombre: empresa?.nombre || "", slug: empresa?.slug || "" },
      email: ocultarCorreo(ficha.email),
      suscrito: !!ficha.promociones?.acepta,
    });
  } catch (error) {
    return fallo(res, "info baja", error);
  }
};

export const darDeBaja = async (req, res) => {
  try {
    const ficha = await darDeBajaPorToken(req.body?.token);
    if (!ficha) return res.status(404).json({ message: "El link no es válido" });
    return res.json({ message: "Listo, ya no recibirás promociones" });
  } catch (error) {
    return fallo(res, "baja", error);
  }
};
