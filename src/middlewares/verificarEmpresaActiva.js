// middlewares/verificarEmpresaActiva.js

import empresaModel from "../models/empresa.model.js";


export const verificarEmpresaActiva = async (req, res, next) => {
  try {
    const empresaId = req.usuario?.empresaId;

    if (!empresaId) return next(); // si no hay empresa en el token, que siga

    const empresa = await empresaModel.findById(empresaId).select("estadoSuscripcion nombre");

    if (!empresa) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    if (empresa.estadoSuscripcion === "suspendido") {
      return res.status(403).json({
        message: "Tu cuenta está suspendida por falta de pago. Contáctanos para reactivarla.",
        code: "EMPRESA_SUSPENDIDA", // útil para manejar esto en el frontend
      });
    }

    next();
  } catch (error) {
    console.error("❌ Error verificarEmpresaActiva:", error);
    res.status(500).json({ message: "Error interno" });
  }
};