import bcrypt from "bcryptjs";
import Usuario from "../models/usuario.model.js";
import { generarToken } from "../utils/generarToken.js";
import crypto from "crypto";
import sendEmail from "../utils/sendEmail.js";
import suscripcionModel from "../models/suscripcion.model.js";
import empresaModel from "../models/empresa.model.js";
import Empresa from "../models/empresa.model.js";
import { sendClaimAccountEmail } from "./mailController.js";

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
    const { slug } = req.params;
    const { rut, nombre, apellido, email, telefono, password } = req.body;

    const empresa = await empresaModel.findOne({ slug });
    if (!empresa) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    const telefonoCompleto = `569${telefono}`;

    const usuarioExistente = await Usuario.findOne({
      empresa: empresa._id,
      $or: [{ rut }, { email }],
    });

    // ✅ NUEVO: Si existe pero es invitado, convertimos su cuenta
    if (usuarioExistente) {
      if (usuarioExistente.rol === "invitado") {
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const verificationToken = crypto.randomBytes(32).toString("hex");
        const verificationTokenExpires = new Date(Date.now() + 60 * 60 * 1000);

        usuarioExistente.pendingPassword = hashedPassword;
        usuarioExistente.verificationToken = verificationToken;
        usuarioExistente.verificationTokenExpires = verificationTokenExpires;

        await usuarioExistente.save();

        const claimUrl = `www.agendafonfach.cl/${slug}/verificar-cuenta?token=${verificationToken}`;

        await sendClaimAccountEmail(usuarioExistente.email, {
          nombreCliente: usuarioExistente.nombre,
          claimUrl,
        });

        return res.status(200).json({
          message:
            "Te enviamos un correo al email con el que reservaste para verificar tu identidad.",
          requiresVerification: true,
        });
      }

      // Si existe pero NO es invitado, rechazamos
      return res
        .status(400)
        .json({ message: "Ya existe una cuenta registrada con estos datos" });
    }

    // Flujo normal de registro
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

    const token = generarToken(newUser);
    const isProduction = process.env.NODE_ENV === "production";

    res.cookie("token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
      path: "/",
    });

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
  try {
    const { email, slug } = req.body;

    if (!email || !slug)
      return res.status(400).json({ message: "Datos inválidos" });

    const empresa = await Empresa.findOne({ slug });

    // ⚠️ Respuesta neutra siempre
    if (!empresa) {
      return res.json({
        message: "Si el email existe, recibirás un correo con instrucciones.",
      });
    }

    const user = await Usuario.findOne({
      email,
      empresa: empresa._id,
    });

    // ⚠️ Misma respuesta aunque no exista
    if (!user) {
      return res.json({
        message: "Si el email existe, recibirás un correo con instrucciones.",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");

    const resetTokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.resetPasswordToken = resetTokenHash;

    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);

    await user.save();

    const resetUrl = `www.agendafonfach.cl/${slug}/reiniciar-contrasena/${resetToken}`;

    await sendEmail({
      to: user.email,
      subject: "Restablecer contraseña",
      html: `
        <p>Haz clic en el enlace para restablecer tu contraseña:</p>
        <a href="${resetUrl}">Restablecer contraseña</a>
        <p>Este enlace expira en 15 minutos.</p>
      `,
    });

    res.json({
      message: "Si el email existe, recibirás un correo con instrucciones.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al procesar la solicitud" });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;

    if (!newPassword)
      return res.status(400).json({ message: "La contraseña es obligatoria" });

    if (newPassword.length < 8)
      return res.status(400).json({
        message: "La contraseña debe tener al menos 8 caracteres",
      });

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const usuario = await Usuario.findOne({
      resetPasswordToken: tokenHash,
      resetPasswordExpires: { $gt: Date.now() },
    });



    if (!usuario)
      return res.status(400).json({
        message: "Token inválido o expirado",
      });

    const saltRounds = 10;
    usuario.password = await bcrypt.hash(newPassword, saltRounds);

    // 🔥 invalidar token
    usuario.resetPasswordToken = undefined;
    usuario.resetPasswordExpires = undefined;

    await usuario.save();

    res.json({ message: "Contraseña actualizada correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error al restablecer contraseña" });
  }
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

export const me = async (req, res) => {
  try {
    // 1️⃣ Usuario
    const usuario = await Usuario.findById(req.usuario.id).select(
      "rut nombre apellido email telefono rol suscrito empresa",
    );

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // 2️⃣ Empresa
    const empresa = await Empresa.findById(usuario.empresa).select(
      "_id nombre slug configuracion",
    );

    // 3️⃣ Suscripción activa
    const suscripcionActiva = await suscripcionModel
      .findOne({
        usuario: usuario._id,
        empresa: usuario.empresa,
        activa: true,
      })
      .select("fechaInicio fechaFin serviciosTotales serviciosUsados");

    res.json({
      id: usuario._id,
      rut: usuario.rut,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      email: usuario.email,
      telefono: usuario.telefono,
      rol: usuario.rol,
      suscrito: usuario.suscrito,

      // ✅ FECHAS VIENEN DE SUSCRIPCIÓN
      fechaInicioSuscripcion: suscripcionActiva?.fechaInicio || null,
      fechaFinSuscripcion: suscripcionActiva?.fechaFin || null,

      // 🔥 EXTRA (por si después lo usas)
      serviciosTotales: suscripcionActiva?.serviciosTotales || 0,
      serviciosUsados: suscripcionActiva?.serviciosUsados || 0,

      empresa,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error obteniendo usuario" });
  }
};

export const verifyClaim = async (req, res) => {
  try {
    const { token } = req.query;

    const usuario = await Usuario.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: new Date() }, // que no haya expirado
      rol: "invitado",
    });

    if (!usuario) {
      return res.status(400).json({
        message: "El enlace de verificación es inválido o ha expirado.",
      });
    }

    // ✅ Activamos la cuenta
    usuario.password = usuario.pendingPassword;
    usuario.rol = "cliente";
    usuario.pendingPassword = null;
    usuario.verificationToken = null;
    usuario.verificationTokenExpires = null;

    await usuario.save();

    // ✅ Logueamos al usuario directamente
    const jwtToken = generarToken(usuario);
    const isProduction = process.env.NODE_ENV === "production";

    res.cookie("token", jwtToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
      path: "/",
    });

    const userWithoutPassword = usuario.toObject();
    delete userWithoutPassword.password;

    return res.status(200).json({
      user: userWithoutPassword,
      token: jwtToken,
      accountClaimed: true,
      message: "¡Cuenta activada exitosamente!",
    });
  } catch (error) {
    console.error("Error en verifyClaim:", error);
    res.status(500).json({ message: error.message });
  }
};
