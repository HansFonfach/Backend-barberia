// middleware/verificarModulo.js
import Empresa from "../models/empresa.model.js";
import Usuario from "../models/usuario.model.js";

// modulo puede ser un string ("clasesGrupales") o un array de strings
// (["clasesGrupales", "entrenamientoPersonal"]) — con array basta que la
// empresa tenga CUALQUIERA de esos módulos activos (OR). Se usa para
// pantallas que sirven a más de un módulo (ej. la bitácora de peso/medidas,
// que es igual de válida para un gimnasio con clases que para una empresa
// que solo usa el entrenamiento personal).
export const verificarModulo = (modulo) => {
  const modulosRequeridos = Array.isArray(modulo) ? modulo : [modulo];

  return async (req, res, next) => {
    try {
      const usuario = await Usuario.findById(req.usuario.id).select("empresa");

      const empresa = await Empresa.findById(usuario.empresa).select("modulos");

      if (!empresa) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const tieneAlguno = modulosRequeridos.some((m) => !!empresa.modulos?.[m]);
      if (!tieneAlguno) {
        return res.status(403).json({
          message:
            modulosRequeridos.length > 1
              ? `Esta empresa no tiene ninguno de los módulos requeridos activo (${modulosRequeridos.join(", ")})`
              : `Esta empresa no tiene el módulo "${modulosRequeridos[0]}" activo`,
        });
      }

      req.empresaId = empresa._id; // lo adjuntamos para no repetir query en el controller
      next();
    } catch (error) {
      res.status(500).json({ message: "Error verificando módulo" });
    }
  };
};