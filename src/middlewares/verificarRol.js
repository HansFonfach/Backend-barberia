export const verificarRol = (...rolesPermitidos) => {
  return (req, res, next) => {
    const { rol, esAdmin } = req.usuario;

   

    if (rolesPermitidos.includes("esAdmin") && esAdmin) return next();
    if (rolesPermitidos.includes(rol)) return next();

    return res.status(403).json({ message: "No tienes permisos para esta acción" });
  };
};