import suscripcionModel from "../models/suscripcion.model.js";
import usuarioModel from "../models/usuario.model.js";
import Usuario from "../models/usuario.model.js";
import bcrypt from "bcryptjs";

//obtener todos los usuarios
export const getUsuarios = async (req, res) => {
  try {
    const usuarios = await Usuario.find();
    res.json(usuarios);
  } catch (error) {
    res.status(500).json({ message: error.message });
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
    console.log("🔍 Backend - Buscando usuario con RUT recibido:", rut);

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
      console.log(
        "⚠️ No encontrado con formato original, buscando con RUT limpio...",
      );

      // Función para limpiar RUT (quitar puntos y guión, convertir a mayúsculas)
      const limpiarRut = (rutStr) => {
        return rutStr.replace(/[\.\-]/g, "").toUpperCase();
      };

      const rutLimpioBuscado = limpiarRut(rut);
      console.log("🔍 RUT limpio para búsqueda:", rutLimpioBuscado);

      // Buscar todos los usuarios y comparar RUTs limpios
      const todosUsuarios = await Usuario.find({});
      usuario = todosUsuarios.find((u) => {
        if (!u.rut) return false;

        const rutBDLimpio = limpiarRut(u.rut);
        const encontrado = rutBDLimpio === rutLimpioBuscado;

        if (encontrado) {
          console.log("✅ Coincidencia encontrada!");
          console.log("   RUT en BD:", u.rut);
          console.log("   RUT BD limpio:", rutBDLimpio);
          console.log("   RUT buscado:", rut);
          console.log("   RUT buscado limpio:", rutLimpioBuscado);
        }

        return encontrado;
      });
    }

    if (!usuario) {
      console.log("❌ Usuario NO encontrado");
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
        rutBuscado: rut,
      });
    }

    console.log("✅ Usuario encontrado:", usuario.nombre, usuario.apellido);
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

export const updateUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, telefono, suscrito, rol, nombre, apellido } = req.body || {};

    const data = {};
    if (nombre !== undefined) data.nombre = nombre;
    if (apellido !== undefined) data.apellido = apellido;
    if (email !== undefined) data.email = email;
    if (telefono !== undefined) data.telefono = telefono;
    if (suscrito !== undefined) data.suscrito = suscrito;
    if (rol !== undefined) data.rol = rol;

    if (Object.keys(data).length === 0) {
      return res
        .status(400)
        .json({ message: "No hay datos válidos para actualizar." });
    }

    const emailExiste = await Usuario.findOne({
      email: email,
      _id: { $ne: id }, // Busca emails iguales pero que NO sean del usuario actual
    });

    if (emailExiste) {
      return res.status(400).json({
        message: `El email ${email} ya se encuentra registrado en nuestra base de datos.`,
      });
    }

    const usuarioActualizado = await Usuario.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });

    if (!usuarioActualizado) {
      return res.status(404).json({ message: "No se encontró al usuario" });
    }

    res.json({
      message: "Usuario actualizado correctamente",
      usuario: data, // solo devolvemos los campos cambiados
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
      { new: true }
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
    const usuarios = await Usuario.find().lean();

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

    res.json({ usuarios: usuariosConSub }); // ← ESTE ES EL CORRECTO
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

    if (!rut || !email || !password) {
      return res.status(400).json({ message: "Campos obligatorios faltantes" });
    }

    if (password !== confirmaPassword) {
      return res.status(400).json({ message: "Las contraseñas no coinciden" });
    }

    const existe = await Usuario.findOne({
      $or: [{ rut }, { email }],
    });

    if (existe) {
      return res
        .status(409)
        .json({ message: "Ya existe un usuario con ese rut o email" });
    }

    const telefonoCompleto = telefono?.startsWith("569")
      ? telefono
      : `569${telefono}`;

    const hashedPassword = await bcrypt.hash(password, 10);

    const nuevoBarbero = await Usuario.create({
      rut,
      nombre,
      apellido,
      email,
      telefono: telefonoCompleto,
      descripcion,
      rol: "barbero",
      password: hashedPassword,
    });

    res.status(201).json(nuevoBarbero);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al crear el barbero" });
  }
};
