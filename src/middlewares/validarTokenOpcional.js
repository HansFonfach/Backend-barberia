import jwt from "jsonwebtoken";
import { TOKEN_SECRET } from "../config.js"; // 👈 mismo secret

export const validarTokenOpcional = (req, res, next) => {
  let token = req.cookies?.token;

  if (!token) {
    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }
  }

  if (!token) {
    req.usuario = null;
    return next();
  }

  jwt.verify(token, TOKEN_SECRET, (err, decoded) => { // 👈 mismo secret y mismo estilo
    if (err) {
      req.usuario = null;
      return next();
    }
    req.usuario = decoded;
    next();
  });
};