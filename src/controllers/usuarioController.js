import suscripcionModel from "../models/suscripcion.model.js";
import Usuario from "../models/usuario.model.js";
import bcrypt from "bcrypt";

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

// controllers/usuarioController.js
export const getUsuarioByRut = async (req, res) => {
  const { rut } = req.params;
  try {
    const usuario = await Usuario.findOne({ rut });
    if (!usuario)
      return res
        .status(404)
        .json({ message: "No se ha encontrado el usuario" });

    res.json({
      _id: usuario._id, // ← CAMBIA id por _id
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      email: usuario.email,
      rut: usuario.rut, // ← Agrega el rut también
    });
  } catch (error) {
    res.status(500).json({ mensaje: "Error del servidor" });
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

//eliminar usuario
export const deleteUsuario = async (req, res) => {
  try {
    res.json();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllUsersWithSuscripcion = async (req, res) => {
  try {
    const usuarios = await Usuario.find().lean();

    const usuariosConSub = await Promise.all(
      usuarios.map(async (u) => {
        const sus = await suscripcionModel.findOne({
          usuario: u._id,
          activa: true,
          fechaInicio: { $lte: new Date() },
          fechaFin: { $gte: new Date() },
        }).lean();
        return { ...u, suscripcion: sus || null };
      })
    );

    res.json({ usuarios: usuariosConSub }); // ← ESTE ES EL CORRECTO
  } catch (err) {
    console.error("❌ ERROR getAllUsersWithSuscripcion:", err);
    res.status(500).json({ message: "Error cargando usuarios" });
  }
};

