import jwt from "jsonwebtoken";
import { TOKEN_SECRET } from "../config.js";

export const generarToken = (usuario) => {
  return jwt.sign(
    {
      id: usuario._id,
      rut: usuario.rut,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      email: usuario.email,
      rol: usuario.rol,
      suscrito: usuario.suscrito,
      telefono: usuario.telefono,
      empresaId: usuario.empresa, // ✅
    },
    TOKEN_SECRET,
    { expiresIn: "1d" }, // configurable
  );
};
