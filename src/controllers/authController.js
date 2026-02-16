import bcrypt from "bcryptjs";
import Usuario from "../models/usuario.model.js";
import { generarToken } from "../utils/generarToken.js";
import crypto from "crypto";
import sendEmail from "../utils/sendEmail.js";
import suscripcionModel from "../models/suscripcion.model.js";
import empresaModel from "../models/empresa.model.js";
import Empresa from "../models/empresa.model.js";

export const login = async (req, res) => {
  const { email, password, slug } = req.body;

  try {
    /* =========================
       1️⃣ VALIDAR EMPRESA
    ========================= */
    const empresa = await empresaModel.findOne({ slug });
    if (!empresa) {
      return res.status(404).json({
        message: "Empresa no encontrada",
      });
    }

    /* =========================
       2️⃣ BUSCAR USUARIO EN ESA EMPRESA
    ========================= */
    const usuario = await Usuario.findOne({
      email,
      empresa: empresa._id,
    });

    if (!usuario) {
      return res
        .status(400)
        .json({ message: "Usuario y/o contraseña incorrecta" });
    }

    /* =========================
       3️⃣ VALIDAR PASSWORD
    ========================= */
    const validPassword = await bcrypt.compare(password, usuario.password);
    if (!validPassword) {
      return res
        .status(400)
        .json({ message: "Usuario y/o contraseña incorrecta" });
    }

    /* =========================
       4️⃣ VALIDAR SUSCRIPCIÓN
    ========================= */
    const suscripcionActiva = await suscripcionModel.findOne({
      usuario: usuario._id,
      activa: true,
    });

    if (suscripcionActiva) {
      const hoy = new Date();

      if (suscripcionActiva.fechaFin < hoy) {
        suscripcionActiva.activa = false;
        await suscripcionActiva.save();

        usuario.suscrito = false;
        usuario.plan = "gratis";
        await usuario.save();
      } else {
        usuario.suscrito = true;
        usuario.plan = "premium";
        await usuario.save();
      }
    }

    /* =========================
       5️⃣ GENERAR TOKEN (CLAVE)
    ========================= */
    const token = generarToken(usuario);

    const userData = usuario.toObject();
    delete userData.password;

    const isProduction = process.env.NODE_ENV === "production";

    res.cookie("token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
      path: "/",
    });

    return res.status(200).json({
      message: "Login exitoso",
      user: {
        ...userData,

        empresa: {
          id: empresa._id,
          nombre: empresa.nombre,
          slug: empresa.slug,
          tipo: empresa.tipo,
        },
      },
      token,
    });
  } catch (error) {
    console.error("Error en login:", error);
    return res.status(500).json({ message: "Error en el servidor" });
  }
};

export const register = async (req, res) => {
  try {
    const { rut, nombre, apellido, email, telefono, password, slug } = req.body;

    const empresa = await empresaModel.findOne({ slug });
    if (!empresa) {
      return res.status(404).json({
        message: "Empresa no encontrada",
      });
    }

    const telefonoCompleto = `569${telefono}`;

    const usuarioExistente = await Usuario.findOne({
      empresa: empresa._id,
      $or: [{ rut }, { email }],
    });
    if (usuarioExistente) {
      return res
        .status(400)
        .json({ message: "Ya existe una cuenta registrada con estos datos" });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = new Usuario({
      rut,
      nombre,
      apellido,
      email,
      empresa: empresa._id,
      telefono: telefonoCompleto,
      password: hashedPassword,
    });
    await newUser.save();
    console.log(newUser);

    const token = generarToken(newUser);

    // ✅ CONFIGURACIÓN MEJORADA PARA MÓVILES
    const isProduction = process.env.NODE_ENV === "production";

    res.cookie("token", token, {
      httpOnly: true,
      secure: isProduction, // ✅ HTTPS obligatorio en producción
      sameSite: isProduction ? "none" : "lax", // ✅ Safari necesita 'none'
      maxAge: 24 * 60 * 60 * 1000,
      path: "/",
    });
    // Ocultar password en la respuesta
    const userWithoutPassword = newUser.toObject();
    delete userWithoutPassword.password;

    res.status(201).json({
      user: userWithoutPassword,
      empresa: {
        id: empresa._id,
        slug: empresa.slug,
        nombre: empresa.nombre,
      },
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

export const authRequired = (req, res, next) => {
  try {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(token, TOKEN_SECRET);

    // Asegurarse de que el id esté disponible
    req.usuario = {
      id: decoded.id,
      ...decoded,
    };

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};
