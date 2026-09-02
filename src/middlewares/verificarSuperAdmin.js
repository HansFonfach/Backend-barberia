import jwt from "jsonwebtoken";
import { TOKEN_SECRET } from "../config.js";

// Guard para las rutas de /superadmin (panel donde Hans gestiona TODAS las
// empresas). Totalmente separado de validarToken.js/req.usuario: usa su
// propia cookie ("superadminToken", no "token") y exige el claim
// superadmin:true en el JWT, así un token de un admin de tenant normal
// (por más "esAdmin" que sea dentro de su empresa) nunca sirve acá, y
// viceversa (validarToken.js rechaza explícitamente los tokens con
// superadmin:true).
export const verificarSuperAdmin = (req, res, next) => {
  let token = req.cookies?.superadminToken;

  if (!token) {
    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }
  }

  if (!token) {
    return res.status(401).json({ message: "No autorizado. No hay token." });
  }

  jwt.verify(token, TOKEN_SECRET, (err, payload) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res
          .status(401)
          .json({ message: "Sesión expirada. Inicia sesión nuevamente." });
      }
      return res.status(403).json({ message: "Token inválido o manipulado." });
    }

    if (!payload?.superadmin) {
      return res.status(403).json({ message: "No autorizado." });
    }

    req.superadmin = payload;
    next();
  });
};
