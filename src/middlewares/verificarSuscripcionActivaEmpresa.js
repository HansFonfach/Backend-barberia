import empresaModel from "../models/empresa.model.js";

export const verificarSuscripcionActivaEmpresa = async (
  req,
  res,
  next
) => {
  try {
    const { slug } = req.params;

    const empresa = await empresaModel.findOne({
      slug,
    });

    if (!empresa) {
      return res.status(404).json({
        ok: false,
        msg: "Empresa no encontrada",
      });
    }

    if (
      empresa.estadoSuscripcion === "suspendido"
    ) {
      return res.status(403).json({
        ok: false,
        suspendido: true,
        msg: "Tu cuenta ha sido suspendida por falta de pago",
      });
    }

    req.empresa = empresa;

    next();
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      ok: false,
      msg: "Error del servidor",
    });
  }
};