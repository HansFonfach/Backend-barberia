// controllers/registroPublico.js
import crypto from "crypto";
import bcrypt from "bcrypt";
import empresaModel from "../models/empresa.model.js";
import Usuario from "../models/usuario.model.js";
import { generarToken } from "../utils/generarToken.js";
import { sendBienvenidaEmpresaEmail } from "./mailController.js";

const generarSlug = (nombre) => {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
};

const generarPasswordAleatoria = () => {
  return crypto.randomBytes(6).toString("base64").slice(0, 10);
};

export const registroPublicoEmpresa = async (req, res) => {
  try {
    const { nombre, tipo, telefono, correo } = req.body;

    // Validación mínima
    if (!nombre || !tipo || !telefono || !correo) {
      return res.status(400).json({ message: "Faltan campos obligatorios" });
    }

    // Verificar si el correo ya está registrado como usuario
    const usuarioExistente = await Usuario.findOne({ email: correo });
    if (usuarioExistente) {
      return res
        .status(400)
        .json({ message: "Este correo ya tiene una cuenta registrada" });
    }

    // Generar slug único
    let slug = generarSlug(nombre);
    const slugExiste = await empresaModel.findOne({ slug });
    if (slugExiste) {
      slug = `${slug}-${crypto.randomBytes(3).toString("hex")}`;
    }

    // Crear empresa en trial
    const nuevaEmpresa = new empresaModel({
      nombre,
      slug,
      tipo,
      telefono,
      correo,
      rutEmpresa: "pendiente", // lo pides luego en onboarding
      plan: "trial",
      trial: {
        activo: true,
        inicio: new Date(),
        fin: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await nuevaEmpresa.save();

    // Generar password aleatoria
    const passwordPlana = generarPasswordAleatoria();
    const hashedPassword = await bcrypt.hash(passwordPlana, 10);

    // Crear usuario admin vinculado a la empresa
    const nuevoAdmin = new Usuario({
      nombre: nombre,
      apellido: "",
      email: correo,
      telefono: `569${telefono.replace(/\D/g, "").slice(-8)}`,
      password: hashedPassword,
      empresa: nuevaEmpresa._id,
      rol: "barbero",
      esAdmin: true, // 👈 esto faltaba
    });

    await nuevoAdmin.save();

    try {
      const resultado = await sendBienvenidaEmpresaEmail(correo, {
        nombreNegocio: nombre,
        slug,
        email: correo,
        password: passwordPlana,
      });
      console.log("✅ Email enviado:", resultado);
    } catch (emailError) {
      console.error("❌ Error enviando email:", emailError);
      // No lanzamos el error para que igual responda 201
    }

    // Opcionalmente loguear directo
    const token = generarToken(nuevoAdmin);

    res.status(201).json({
      message: "¡Negocio creado! Revisa tu correo con tus credenciales.",
      slug,
      token, // si quieres dejarlo logueado de una
    });
  } catch (error) {
    console.error("Error en registroPublicoEmpresa:", error);
    res.status(500).json({ message: error.message });
  }
};
