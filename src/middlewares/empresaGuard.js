export const empresaGuard = async (req, res, next) => {
  const { slug } = req.params;

  const empresa = await Empresa.findOne({ slug });
  if (!empresa) {
    return res.status(404).json({ message: "Empresa no existe" });
  }

  if (empresa._id.toString() !== req.usuario.empresa.toString()) {
    return res.status(403).json({ message: "No autorizado para esta empresa" });
  }

  req.empresa = empresa;
  next();
};