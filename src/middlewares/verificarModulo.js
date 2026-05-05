// middleware/verificarModulo.js
import Empresa from "../models/empresa.model.js";
import Usuario from "../models/usuario.model.js";

export const verificarModulo = (modulo) => {
  return async (req, res, next) => {
    try {
      const usuario = await Usuario.findById(req.usuario.id).select("empresa");

      const empresa = await Empresa.findById(usuario.empresa).select("modulos");

      if (!empresa) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      if (!empresa.modulos?.[modulo]) {
        return res.status(403).json({
          message: `Esta empresa no tiene el módulo "${modulo}" activo`,
        });
      }

      req.empresaId = empresa._id; // lo adjuntamos para no repetir query en el controller
      next();
    } catch (error) {
      res.status(500).json({ message: "Error verificando módulo" });
    }
  };
};