import jwt from "jsonwebtoken";
import { TOKEN_SECRET } from "../config.js";

// duracion: "12h" normal; "30d" cuando marcan "Recordarme" al iniciar sesión
export const generarToken = (usuario, duracion = "12h") => {
  return jwt.sign(
    {
      id: usuario._id,
      rut: usuario.rut,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      email: usuario.email,
      rol: usuario.rol,
      esAdmin: usuario.esAdmin, // 👈 agrega esto
      suscrito: usuario.suscrito,
      telefono: usuario.telefono,
      empresaId: usuario.empresa, // ✅
    },
    TOKEN_SECRET,
    { expiresIn: duracion },
  );
};
