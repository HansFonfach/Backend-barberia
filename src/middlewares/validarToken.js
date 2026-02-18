import jwt from "jsonwebtoken";
import { TOKEN_SECRET } from "../config.js";

export const validarToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No autorizado" });
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(token, TOKEN_SECRET, (err, usuario) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expirado" });
      }
      return res.status(403).json({ message: "Token inválido" });
    }

    req.usuario = usuario;
    next();
  });
};
