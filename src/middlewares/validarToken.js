import jwt from "jsonwebtoken";
import { TOKEN_SECRET } from "../config.js";

export const validarToken = (req, res, next) => {
  // ✅ Leer desde cookie O desde header Authorization
  let token = req.cookies?.token;

  if (!token) {
    const authHeader = req.headers["authorization"];
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
        return res
          .status(401)
          .json({ message: "Token expirado. Inicia sesión nuevamente." });
      }
      return res.status(403).json({ message: "Token inválido o manipulado." });
    }
   
    req.usuario = usuario;
    next();
  });
};
