export const verificarRol = (...rolesPermitidos) => {
  return (req, res, next) => {
    const rol = req.usuario?.rol;
    if (!rolesPermitidos.includes(rol)) {
      return res
        .status(403)
        .json({ message: "No tienes permisos para esta acción" });
    }
    next();
  };
};
