// controllers/registroPublicoEmpresa.js
//
// Registro público de un negocio nuevo (página "Registrar negocio"):
//  1. valida los datos (rubro conocido, correo, celular, ciudad);
//  2. crea la empresa en prueba de 7 días, con el módulo de su rubro
//     (restaurante → reservas de mesa, cancha → canchas);
//  3. crea el usuario administrador. Si el dueño también atiende clientes
//     queda como profesional (aparece en la página y en la agenda); si no,
//     solo administra. Restaurantes y canchas: siempre solo administra;
//  4. le manda la bienvenida con su contraseña y los primeros pasos.
// Si el usuario no se puede crear, se borra la empresa (no quedan huérfanas).
import crypto from "crypto";
import bcrypt from "bcrypt";
import empresaModel from "../models/empresa.model.js";
import Usuario from "../models/usuario.model.js";
import { generarToken } from "../utils/generarToken.js";
import { normalizarTelefonoCL } from "../utils/telefono.js";
import { finDePrueba } from "../utils/pruebaGratis.js";
import { sendBienvenidaEmpresaEmail } from "./mailController.js";

const generarSlug = (nombre) =>
  String(nombre || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);

// Rutas de la página que no pueden ser el slug de un negocio
const SLUGS_RESERVADOS = [
  "negocios", "admin", "superadmin", "registro-negocio", "baja-promociones",
  "asistencia-mesa", "confirmar-reserva", "cancelar-reserva", "sitemap.xml", "robots.txt",
  "login", "register", "auth", "api", "politicas", "centro-ayuda", "contacto",
];

// Rubros con menú propio: el dueño administra, no atiende como profesional
const RUBROS_SOLO_ADMIN = ["restaurante", "cancha"];
const MODULOS_POR_RUBRO = {
  restaurante: { reservasMesas: true },
  cancha: { canchas: true },
};

const texto = (v, max) => String(v ?? "").trim().slice(0, max);
const esEmailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

const generarPasswordAleatoria = () => crypto.randomBytes(6).toString("base64").slice(0, 10);

export const registroPublicoEmpresa = async (req, res) => {
  try {
    const body = req.body || {};
    const nombre = texto(body.nombre, 80);
    const rubro = texto(body.rubro, 40);
    const correo = texto(body.correo, 120).toLowerCase();
    const ciudad = texto(body.ciudad, 60);
    const nombreContacto = texto(body.nombreContacto, 80);
    const telefono = normalizarTelefonoCL(texto(body.telefono, 30));

    // ── Validación ──
    const rubrosValidos = empresaModel.schema.path("rubro").enumValues;
    if (nombre.length < 2) return res.status(400).json({ message: "Escribe el nombre del negocio" });
    if (!rubrosValidos.includes(rubro)) return res.status(400).json({ message: "Elige el tipo de negocio" });
    if (!esEmailValido(correo)) return res.status(400).json({ message: "El correo no es válido" });
    if (!/^569\d{8}$/.test(telefono || "")) {
      return res.status(400).json({ message: "Escribe un celular válido: los 8 números después del +56 9" });
    }

    // Doble clic / reenvío: el mismo correo acaba de crear un negocio
    const hace10min = new Date(Date.now() - 10 * 60 * 1000);
    const reciente = await empresaModel.findOne({ correo, "trial.inicio": { $gte: hace10min } }).select("slug").lean();
    if (reciente) {
      return res.status(409).json({ message: "Ya creaste un negocio con este correo hace un momento. Revisa tu bandeja de entrada (y spam)." });
    }

    // ── Slug único ──
    let slug = generarSlug(nombre) || "negocio";
    if (SLUGS_RESERVADOS.includes(slug) || (await empresaModel.exists({ slug }))) {
      slug = `${slug}-${crypto.randomBytes(3).toString("hex")}`;
    }

    // ── Empresa en prueba ──
    const inicio = new Date();
    const fin = finDePrueba(inicio);
    const nuevaEmpresa = await empresaModel.create({
      nombre,
      slug,
      rubro,
      telefono,
      correo,
      ciudad,
      rutEmpresa: "pendiente", // se pide después
      ...(MODULOS_POR_RUBRO[rubro] ? { modulos: MODULOS_POR_RUBRO[rubro] } : {}),
      plan: "trial",
      estadoSuscripcion: "trial",
      trial: { activo: true, inicio, fin },
    });

    // ── Administrador ──
    const soloAdmin = RUBROS_SOLO_ADMIN.includes(rubro);
    // Si el formulario antiguo no manda "atiende", se mantiene lo de antes (atiende)
    const atiende = !soloAdmin && body.atiende !== false && body.atiende !== "false";
    const [nombrePersona, ...resto] = (nombreContacto || nombre).split(/\s+/);
    const passwordPlana = generarPasswordAleatoria();

    let nuevoAdmin;
    try {
      nuevoAdmin = await Usuario.create({
        nombre: nombreContacto ? nombrePersona : nombre,
        apellido: nombreContacto ? resto.join(" ") : "",
        email: correo,
        telefono,
        password: await bcrypt.hash(passwordPlana, 10),
        empresa: nuevaEmpresa._id,
        rol: "barbero",
        esAdmin: true,
        atiendeClientes: atiende,
      });
    } catch (e) {
      // Sin admin la empresa no sirve: se borra para no dejarla huérfana
      await empresaModel.deleteOne({ _id: nuevaEmpresa._id });
      throw e;
    }

    try {
      await sendBienvenidaEmpresaEmail(correo, {
        nombreNegocio: nombre,
        nombreContacto: nombreContacto ? nombrePersona : "",
        slug,
        email: correo,
        password: passwordPlana,
        rubro,
        atiende,
        finPrueba: fin,
      });
    } catch (emailError) {
      console.error("❌ Error enviando bienvenida de empresa:", emailError);
      // No se corta el registro por el correo
    }

    return res.status(201).json({
      message: "¡Negocio creado! Revisa tu correo con tus credenciales.",
      slug,
      token: generarToken(nuevoAdmin),
    });
  } catch (error) {
    console.error("❌ Error en registroPublicoEmpresa:", error);
    if (error?.name === "ValidationError") {
      return res.status(400).json({ message: "Revisa los datos del formulario e intenta de nuevo." });
    }
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Ese negocio ya está registrado. Si es tuyo, inicia sesión." });
    }
    return res.status(500).json({ message: "No pudimos crear el negocio. Intenta de nuevo en unos minutos." });
  }
};
