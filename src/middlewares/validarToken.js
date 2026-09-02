import jwt from "jsonwebtoken";
import { TOKEN_SECRET } from "../config.js";
import Empresa from "../models/empresa.model.js";

// Estados de estadoSuscripcion que bloquean el acceso (ver empresa.model.js).
// "trial" y "activo" pasan normal.
const ESTADOS_SUSCRIPCION_BLOQUEADOS = ["suspendido", "cancelado"];

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

  jwt.verify(token, TOKEN_SECRET, async (err, usuario) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res
          .status(401)
          .json({ message: "Token expirado. Inicia sesión nuevamente." });
      }
      return res.status(403).json({ message: "Token inválido o manipulado." });
    }

    // Un token de super-admin (ver verificarSuperAdmin.js) no tiene
    // empresaId ni sirve para rutas de tenant — se rechaza acá explícitamente
    // en vez de dejar que las rutas de abajo fallen con datos indefinidos.
    if (usuario.superadmin) {
      return res.status(403).json({ message: "Token no válido para esta ruta." });
    }

    // 🔒 Antes esto no se revisaba en NINGÚN lado después del login: el JWT
    // dura 12h y nunca se revalidaba contra la base de datos, así que marcar
    // una empresa como "inactivo"/"suspendido" no bloqueaba nada hasta que el
    // token expirara solo (y ni siquiera entonces, porque el login tampoco lo
    // revisaba — ver authController.js). Ahora se revisa en cada request
    // protegido, así que un cambio de estado hecho desde el panel de
    // super-admin bloquea el acceso de inmediato, no en hasta 12 horas más.
    if (usuario.empresaId) {
      try {
        const empresa = await Empresa.findById(
          usuario.empresaId,
          "estado estadoSuscripcion",
        ).lean();

        if (!empresa) {
          return res.status(403).json({ message: "Empresa no encontrada." });
        }
        if (empresa.estado === "inactivo") {
          return res.status(403).json({
            code: "EMPRESA_INACTIVA",
            message: "Esta cuenta fue desactivada. Contacta con soporte.",
          });
        }
        if (ESTADOS_SUSCRIPCION_BLOQUEADOS.includes(empresa.estadoSuscripcion)) {
          return res.status(403).json({
            code: "EMPRESA_SUSPENDIDA",
            message:
              "Esta cuenta está suspendida por pago pendiente. Contacta con soporte.",
          });
        }
      } catch (dbError) {
        console.error("Error verificando estado de empresa en validarToken:", dbError);
        return res
          .status(500)
          .json({ message: "Error interno al verificar la cuenta." });
      }
    }

    req.usuario = usuario;
    next();
  });
};
