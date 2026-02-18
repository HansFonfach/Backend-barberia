import jwt from "jsonwebtoken";
import { TOKEN_SECRET } from "../config.js";

export const validarToken = (req, res, next) => {
  // 1️⃣ Buscar token en diferentes lugares
  let token = req.cookies.token; // Cookie primero
  
  // 2️⃣ Si no hay cookie, buscar en header Authorization
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }
  }

  if (!token) {
    return res.status(401).json({ message: "No autorizado. No hay token." });
  }

  jwt.verify(token, TOKEN_SECRET, (err, usuario) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expirado. Inicia sesión nuevamente." });
      }
      return res.status(403).json({ message: "Token inválido o manipulado." });
    }

    req.usuario = usuario;
    next();
  });
};