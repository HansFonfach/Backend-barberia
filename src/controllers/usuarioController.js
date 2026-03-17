import empresaModel from "../models/empresa.model.js";
import suscripcionModel from "../models/suscripcion.model.js";
import usuarioModel from "../models/usuario.model.js";
import Usuario from "../models/usuario.model.js";
import bcrypt from "bcryptjs";
import cloudinary from "../config/cloudinary.js";


//obtener todos los usuarios
export const getUsuarios = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId; // viene del token
    if (!empresaId) {
      return res
        .status(400)
        .json({ message: "No se pudo identificar la empresa del usuario" });
    }

    const usuarios = await Usuario.find({ empresa: empresaId });
    res.json(usuarios);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getBarberosPublicos = async (req, res) => {
  try {
    const { slug } = req.params;

    // 1️⃣ Buscar empresa por slug
    const empresa = await empresaModel.findOne({ slug });
    if (!empresa) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    // 2️⃣ Buscar barberos activos de esa empresa
    const barberos = await usuarioModel
      .find({
        empresa: empresa._id,
        rol: "barbero",
        estado: "activo", // 🔹 Cambiado de activo: true a estado: "activo"
      })
      .select("_id nombre apellido descripcion perfilProfesional")
      .lean();

    res.status(200).json(barberos);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error al obtener barberos", error: error.message });
  }
};

//obtener usuario por id
export const getUsuarioById = async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario)
      return res
        .status(404)
        .json({ message: "No se ha encontrado el usuario " });
    res.json(usuario);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getUsuarioByRut = async (req, res) => {
  const { rut } = req.params;

  try {
    if (!rut || rut.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "RUT no proporcionado",
      });
    }

    // 1. Primero intentar buscar exactamente como viene
    let usuario = await Usuario.findOne({ rut: rut });

    // 2. Si no encuentra, buscar con RUT limpio
    if (!usuario) {
      // Función para limpiar RUT (quitar puntos y guión, convertir a mayúsculas)
      const limpiarRut = (rutStr) => {
        return rutStr.replace(/[\.\-]/g, "").toUpperCase();
      };

      const rutLimpioBuscado = limpiarRut(rut);

      // Buscar todos los usuarios y comparar RUTs limpios
      const todosUsuarios = await Usuario.find({});
      usuario = todosUsuarios.find((u) => {
        if (!u.rut) return false;

        const rutBDLimpio = limpiarRut(u.rut);
        const encontrado = rutBDLimpio === rutLimpioBuscado;

        if (encontrado) {
        }

        return encontrado;
      });
    }

    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
        rutBuscado: rut,
      });
    }

    res.json({
      success: true,
      _id: usuario._id,
      id: usuario._id,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      email: usuario.email,
      rut: usuario.rut,
      telefono: usuario.telefono || "",
      suscrito: usuario.suscrito || false,
      rol: usuario.rol,
      puntos: usuario.puntos || 0,
    });
  } catch (error) {
    console.error("💥 Error en getUsuarioByRut:", error);
    res.status(500).json({
      success: false,
      message: "Error del servidor",
      error: error.message,
    });
  }
};

export const updatePerfil = async (req, res) => {
  try {
    const id = req.usuario.id; // 🔥 viene del token

    const { email, telefono, nombre, apellido } = req.body;

    const data = {};
    if (nombre !== undefined) data.nombre = nombre;
    if (apellido !== undefined) data.apellido = apellido;
    if (email !== undefined) data.email = email;
    if (telefono !== undefined) data.telefono = telefono;

    if (!Object.keys(data).length) {
      return res.status(400).json({
        message: "No hay datos válidos para actualizar",
      });
    }

    const emailExiste = await Usuario.findOne({
      email,
      _id: { $ne: id },
    });

    if (emailExiste) {
      return res.status(400).json({
        message: "El email ya está en uso",
      });
    }

    const usuarioActualizado = await Usuario.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });

    res.json({
      message: "Perfil actualizado correctamente",
      usuario: usuarioActualizado,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};


export const updateUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      email, telefono, suscrito, rol,
      nombre, apellido, descripcion,
      aniosExperiencia,
    } = req.body || {};

    const data = {};
    if (nombre !== undefined) data.nombre = nombre;
    if (apellido !== undefined) data.apellido = apellido;
    if (email !== undefined) data.email = email;
    if (telefono !== undefined) data.telefono = telefono;
    if (suscrito !== undefined) data.suscrito = suscrito;
    if (rol !== undefined) data.rol = rol;
    if (descripcion !== undefined) data.descripcion = descripcion;

    // Campos anidados de perfilProfesional
    if (aniosExperiencia !== undefined)
      data["perfilProfesional.aniosExperiencia"] = aniosExperiencia;

    // Especialidades — vienen como especialidades[] en FormData
    const especialidades = req.body["especialidades[]"];
    if (especialidades !== undefined) {
      data["perfilProfesional.especialidades"] = Array.isArray(especialidades)
        ? especialidades
        : [especialidades]; // si viene uno solo, multer lo da como string
    }

    // Foto — solo si se subió archivo
    if (req.file) {
      const resultado = await cloudinary(req.file);
      data["perfilProfesional.fotoPerfil.url"] = resultado.secure_url;
      data["perfilProfesional.fotoPerfil.publicId"] = resultado.public_id;
    }

    if (Object.keys(data).length === 0)
      return res.status(400).json({ message: "No hay datos válidos para actualizar." });

    // Validar email duplicado solo si se está cambiando
    if (email) {
      const emailExiste = await Usuario.findOne({ email, _id: { $ne: id } });
      if (emailExiste)
        return res.status(400).json({
          message: `El email ${email} ya se encuentra registrado.`,
        });
    }

    const usuarioActualizado = await Usuario.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });

    if (!usuarioActualizado)
      return res.status(404).json({ message: "No se encontró al usuario" });

    res.json({
      message: "Usuario actualizado correctamente",
      usuario: usuarioActualizado,
    });
  } catch (error) {
    console.error("Error al actualizar usuario:", error);
    res.status(500).json({ message: "Error del servidor: " + error.message });
  }
};

export const cambiarEstadoUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body; // "activo" | "inactivo"

    const usuario = await Usuario.findByIdAndUpdate(
      id,
      { estado },
      { new: true },
    );

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json(usuario);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllUsersWithSuscripcion = async (req, res) => {
  try {
    // 🔹 Obtener empresaId del token
    const empresaId = req.usuario.empresaId;
    if (!empresaId)
      return res
        .status(400)
        .json({ message: "No se pudo identificar la empresa del usuario" });

    // 🔹 Filtrar usuarios por empresa y rol
    const usuarios = await Usuario.find({
      empresa: empresaId,
    }).lean();

    const usuariosConSub = await Promise.all(
      usuarios.map(async (u) => {
        const sus = await suscripcionModel
          .findOne({
            usuario: u._id,
            activa: true,
            fechaInicio: { $lte: new Date() },
            fechaFin: { $gte: new Date() },
          })
          .lean();

        return { ...u, suscripcion: sus || null };
      }),
    );

    res.json({ usuarios: usuariosConSub });
  } catch (err) {
    console.error("❌ ERROR getAllUsersWithSuscripcion:", err);
    res.status(500).json({ message: "Error cargando usuarios" });
  }
};

export const verMisPuntos = async (req, res) => {
  try {
    const userId = req.usuario.id;

    const user = await usuarioModel.findById(userId).select("puntos nombre");

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json({
      puntos: user.puntos,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener puntos" });
  }
};

export const crearBarbero = async (req, res) => {
  try {
    const {
      rut,
      nombre,
      apellido,
      telefono,
      email,
      descripcion,
      password,
      confirmaPassword,
    } = req.body;

    const empresaId = req.usuario?.empresaId; // 👈 viene del token

    if (!empresaId) {
      return res
        .status(400)
        .json({ message: "No se pudo identificar la empresa" });
    }

    if (!rut || !email || !password)
      return res.status(400).json({ message: "Campos obligatorios faltantes" });

    if (password !== confirmaPassword)
      return res.status(400).json({ message: "Las contraseñas no coinciden" });

    const existe = await Usuario.findOne({ $or: [{ rut }, { email }] });
    if (existe)
      return res
        .status(409)
        .json({ message: "Ya existe un usuario con ese rut o email" });

    const telefonoCompleto = telefono?.startsWith("569")
      ? telefono
      : `569${telefono}`;
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Subir foto a Cloudinary si viene en el request
    let fotoPerfil = { url: null, publicId: null };
    if (req.file) {
      const resultado = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder: "profesionales",
              transformation: [
                { width: 500, height: 500, crop: "fill", gravity: "face" },
              ],
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            },
          )
          .end(req.file.buffer); // 👈 aquí usas el buffer
      });

      fotoPerfil = { url: resultado.secure_url, publicId: resultado.public_id };
    }

    const nuevoBarbero = await Usuario.create({
      rut,
      nombre,
      apellido,
      email,
      telefono: telefonoCompleto,
      descripcion,
      rol: "barbero",
      empresa: empresaId, // 👈 agrega esto
      password: hashedPassword,
      perfilProfesional: { fotoPerfil },
    });

    res.status(201).json(nuevoBarbero);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al crear el barbero" });
  }
};
