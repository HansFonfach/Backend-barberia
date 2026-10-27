import crypto from "crypto";

// Sin letras/números que se confunden al dictarlos por teléfono (0/O, 1/I/L)
const ALFABETO_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const generarCodigo = (largo = 6) => {
  const bytes = crypto.randomBytes(largo);
  let codigo = "";
  for (let i = 0; i < largo; i++) {
    codigo += ALFABETO_CODIGO[bytes[i] % ALFABETO_CODIGO.length];
  }
  return codigo;
};

/** Solo dígitos; para Chile se comparan los últimos 9 (sin +56). */
export const normalizarTelefono = (telefono) => {
  const digitos = String(telefono || "").replace(/\D/g, "");
  return digitos.length > 9 ? digitos.slice(-9) : digitos;
};

export const esTelefonoValido = (telefono) => {
  const digitos = String(telefono || "").replace(/\D/g, "");
  return digitos.length >= 8 && digitos.length <= 15;
};

export const esEmailValido = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || "").trim());

export const limpiarTexto = (valor, max) =>
  String(valor ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);

export const escaparRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const hashToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex");

export const generarTokenCancelacion = () => {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, hash: hashToken(token) };
};

/** Arma una entrada del historial. `actor` = { id, nombre } o null (web). */
export const entradaHistorial = (actor, accion, { detalle = "", cambios = null } = {}) => ({
  fecha: new Date(),
  usuario: actor?.id || null,
  nombreUsuario: actor?.nombre || "web",
  accion,
  detalle,
  cambios,
});

/** Diferencias { campo: [antes, después] } entre dos objetos planos. */
export const diferencias = (antes, despues, campos) => {
  const cambios = {};
  for (const campo of campos) {
    const a = antes[campo];
    const d = despues[campo];
    if (JSON.stringify(a ?? null) !== JSON.stringify(d ?? null)) {
      cambios[campo] = [a ?? null, d ?? null];
    }
  }
  return Object.keys(cambios).length ? cambios : null;
};

/**
 * Usuario de Instagram a partir de lo que guardó el local: un link
 * ("https://www.instagram.com/santafeovalle/?hl=es") o "@santafeovalle".
 */
export const usuarioInstagram = (valor) => {
  const v = String(valor || "").trim();
  if (!v) return "";
  const m = v.match(/instagram\.com\/([A-Za-z0-9._]+)/i) || v.match(/^@?([A-Za-z0-9._]+)$/);
  return m ? m[1] : "";
};
