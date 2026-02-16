import jwt from "jsonwebtoken";
import { TOKEN_SECRET } from "../config.js";

export const validarToken = (req, res, next) => {
  try {
    // 🔍 Buscar token en cookie o header
    const token = req.cookies?.token || 
                  req.headers.authorization?.startsWith('Bearer ') && 
                  req.headers.authorization.substring(7);

    if (!token) {
      return res.status(401).json({ 
        message: "No autorizado",
        code: "NO_TOKEN",
        detalles: "Token no encontrado en cookie ni header"
      });
    }

    jwt.verify(token, TOKEN_SECRET, (err, usuario) => {
      if (err) {
        if (err.name === "TokenExpiredError") {
          return res.status(401).json({ 
            message: "Sesión expirada",
            code: "TOKEN_EXPIRED"
          });
        }
        
        return res.status(403).json({ 
          message: "Token inválido",
          code: "INVALID_TOKEN"
        });
      }

      // ✅ Token válido
      req.usuario = {
        id: usuario.id || usuario._id,
        ...usuario
      };
      
      next();
    });
  } catch (error) {
    console.error("Error en validarToken:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};