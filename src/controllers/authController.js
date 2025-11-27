import bcrypt from "bcryptjs";
import Usuario from "../models/usuario.model.js";
import { generarToken } from "../utils/generarToken.js";
import crypto from "crypto";
import sendEmail from "../utils/sendEmail.js";

export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const usuario = await Usuario.findOne({ email });
    if (!usuario) {
      return res
        .status(400)
        .json({ message: "Usuario y/o contraseña incorrecta" });
    }

    const validPassword = await bcrypt.compare(password, usuario.password);
    if (!validPassword) {
      return res
        .status(400)
        .json({ message: "Usuario y/o contraseña incorrecta" });
    }

    const userData = usuario.toObject();
    delete userData.password;

    const token = generarToken(usuario);

    // ✅ SOLO cookies - NO enviar token en el response JSON
    const isProduction = process.env.NODE_ENV === "production";

    res.cookie("token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    // ✅ Respuesta SIN token
    return res.status(200).json({
      message: "Login exitoso",
      user: userData,
    });
  } catch (error) {
    console.error("Error en login:", error);
    return res.status(500).json({ message: "Error en el servidor" });
  }
};

export const register = async (req, res) => {
  try {
    const { rut, nombre, apellido, email, telefono, password } = req.body;

    const usuarioExistente = await Usuario.findOne({
      $or: [{ rut }, { email }],
    });
    if (usuarioExistente) {
      return res
        .status(400)
        .json({ message: "El usuario ya existe (RUT o email)" });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = new Usuario({
      rut,
      nombre,
      apellido,
      email,
      telefono,
      password: hashedPassword,
    });
    await newUser.save();

    const token = generarToken(newUser);

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });

    // Ocultar password en la respuesta
    const userWithoutPassword = newUser.toObject();
    delete userWithoutPassword.password;

    res.status(201).json({
      user: userWithoutPassword,
      message: "Usuario creado exitosamente!",
      token,
    });
  } catch (error) {
    console.error("Error en register:", error);
    res.status(500).json({ message: error.message });
  }
};

export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  const user = await Usuario.findOne({ email });

  if (!user)
    return res.status(400).json({ message: "No hemos encontrado el Email" });

  const resetToken = crypto.randomBytes(32).toString("hex");
  const expireDate = Date.now() + 15 * 60 * 1000;

  user.resetToken = resetToken;
  user.resetTokenExpire = expireDate;
  await user.save();

  const resetUrl = `http://localhost:3000/reiniciar-contrasena/${resetToken}`;

  await sendEmail({
    to: user.email,
    subject: "Restablecer contraseña",
    html: `
      <p>Haz clic en el enlace para restablecer tu contraseña:</p>
      <a href="${resetUrl}">Restablecer contraseña</a>
    `,
  });
  res.json({ message: "Hemos enviado el Email correctamente" });
};

export const updateUsuarioPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    const usuario = await Usuario.findById(id);
    if (!usuario)
      return res.status(404).json({ message: "No se encontró el usuario." });

    const isMatch = await bcrypt.compare(currentPassword, usuario.password);
    if (!isMatch)
      return res.status(400).json({ message: "Las contraseñas no coinciden." });

    const saltRounds = 10;
    usuario.password = await bcrypt.hash(newPassword, saltRounds); //Asigna el hash al campo password del usuario en memoria.

    await usuario.save();

    res.json({ message: "Contraseña actualizada correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const logout = (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });

  res.json({ message: "Logout exitoso" });
};
