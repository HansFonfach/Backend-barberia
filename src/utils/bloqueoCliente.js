// utils/bloqueoCliente.js
//
// Bloqueo manual de clientes (Clientes → Bloquear). Un cliente bloqueado no
// puede reservar horas ni inscribirse a clases por su cuenta. El admin o el
// profesional sí pueden agendarlo desde el panel, si deciden darle otra
// oportunidad.
//
// Para que no baste con inventar otro correo, una reserva queda bloqueada si
// CUALQUIERA de estos datos coincide con un cliente bloqueado del negocio:
// la cuenta, el RUT, el correo o el teléfono.
import jwt from "jsonwebtoken";
import { TOKEN_SECRET } from "../config.js";
import Usuario from "../models/usuario.model.js";

// Mensaje neutro: no se le dice al cliente que está bloqueado.
export const respuestaBloqueo = {
  code: "CLIENTE_BLOQUEADO",
  message: "No es posible agendar en línea. Por favor comunícate directamente con el local.",
};

// "12.345.678-k", "12345678K" → "12345678K"
const limpiarRut = (rut) => {
  const r = String(rut || "").replace(/[^0-9kK]/g, "").toUpperCase();
  return r.length >= 7 ? r : "";
};
const limpiarEmail = (email) => {
  const e = String(email || "").trim().toLowerCase();
  return e.includes("@") ? e : "";
};
// Últimos 8 dígitos: "+56 9 1234 5678", "912345678" y "12345678" son el mismo número
const limpiarTelefono = (telefono) => {
  const d = String(telefono || "").replace(/\D/g, "");
  return d.length >= 8 ? d.slice(-8) : "";
};

const claves = (p = {}) => ({
  id: p._id ? String(p._id) : "",
  rut: limpiarRut(p.rut),
  email: limpiarEmail(p.email),
  telefono: limpiarTelefono(p.telefono),
});

/** ¿Alguno de los datos de `personas` coincide con el cliente bloqueado `bloqueado`? */
export const coincideConBloqueado = (bloqueado, personas) => {
  const b = claves(bloqueado);
  return personas
    .filter(Boolean)
    .map(claves)
    .some(
      (d) =>
        (d.id && d.id === b.id) ||
        (d.rut && d.rut === b.rut) ||
        (d.email && d.email === b.email) ||
        (d.telefono && d.telefono === b.telefono),
    );
};

/**
 * Busca un cliente bloqueado del negocio que coincida con alguno de los datos
 * recibidos ({ _id, rut, email, telefono }). Devuelve el cliente o null.
 */
export const buscarClienteBloqueado = async (empresaId, ...personas) => {
  if (!empresaId || !personas.some(Boolean)) return null;
  const bloqueados = await Usuario.find({ empresa: empresaId, "bloqueo.activo": true })
    .select("_id rut email telefono")
    .lean();
  return bloqueados.find((b) => coincideConBloqueado(b, personas)) || null;
};

/** Igual que la anterior, partiendo solo del id del cliente. */
export const buscarBloqueoPorId = async (empresaId, usuarioId) => {
  if (!usuarioId) return null;
  const u = await Usuario.findById(usuarioId).select("rut email telefono").lean();
  return buscarClienteBloqueado(empresaId, { _id: usuarioId, ...(u || {}) });
};

/** Admin o profesional del negocio (puede agendar a un cliente bloqueado). */
export const esRolPersonal = (u) =>
  !!u && (u.esAdmin === true || u.rol === "barbero" || u.rol === "admin");

/**
 * Para las rutas públicas (sin validarToken): ¿quien llama es personal de
 * ESTE negocio con la sesión iniciada? Pasa cuando el admin agenda a un
 * invitado desde "Agendar cliente", que usa la misma ruta pública.
 */
export const personalDesdeToken = (req, empresaId) => {
  if (!TOKEN_SECRET) return false;
  const tokens = [req.cookies?.token];
  const auth = req.headers?.authorization;
  if (auth && auth.startsWith("Bearer ")) tokens.push(auth.slice(7));
  for (const token of tokens.filter(Boolean)) {
    try {
      const p = jwt.verify(token, TOKEN_SECRET);
      if (!p.superadmin && String(p.empresaId) === String(empresaId) && esRolPersonal(p)) return true;
    } catch {
      // token vencido o inválido: se trata como público
    }
  }
  return false;
};
