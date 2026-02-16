import jwt from "jsonwebtoken";
import { TOKEN_SECRET } from "../config.js";

export const validarToken = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ message: "No autorizado. No hay token." });
  }

  jwt.verify(token, TOKEN_SECRET, (err, usuario) => {
    if (err) {
      // Diferenciar errores comunes de JWT
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expirado. Inicia sesión nuevamente." });
      }
      return res.status(403).json({ message: "Token inválido o manipulado." });
    }

    req.usuario = usuario; // aquí guardas los datos del usuario del token
    next();
  });
};
