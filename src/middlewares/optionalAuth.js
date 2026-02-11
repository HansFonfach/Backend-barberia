import jwt from "jsonwebtoken";
import { TOKEN_SECRET } from "../config.js";

/**
 * Middleware de autenticación opcional
 * - Si el usuario envía token válido → req.usuario con datos
 * - Si no envía token → req.usuario = null, permite invitados
 */
export const optionalAuth = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    // No hay token → invitado
    req.usuario = null;
    return next();
  }

  jwt.verify(token, TOKEN_SECRET, (err, usuario) => {
    if (err) {
      // Token inválido o expirado → tratar como invitado
      req.usuario = null;
      return next();
    }

    // Token válido → guardamos datos del usuario
    req.usuario = usuario;
    next();
  });
};
