import canjeModel from "../models/canje.model.js";
import usuarioModel from "../models/usuario.model.js";

export const createCanje = async (req, res) => {
  const { nombre, descripcion, puntos, categoria, stock } = req.body;

  try {
    const canje = await canjeModel.create({
      nombre,
      descripcion,
      puntos,
      categoria,
      stock,
    });
    res.status(201).json({
      canje,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteCanje = async (req, res) => {
  const { id } = req.params;
  try {
    const canjeEliminado = await canjeModel.findByIdAndUpdate(id, {
      activo: false,
    });

    if (!canjeEliminado) {
      return res.status(404).json({
        message: `No se ha encontrado el producto con el id ${id}`,
      });
    }
    res.status(200).json({
      message: "Producto actualizado correctamente",
      canje: canjeEliminado,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateCanje = async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, puntos, categoria, stock } = req.body;

  try {
    const canjeActualizado = await canjeModel.findByIdAndUpdate(
      id,
      {
        nombre,
        descripcion,
        puntos,
        categoria,
        stock,
      },
      {
        new: true, // devuelve el documento actualizado
        runValidators: true, // valida según el schema
      }
    );

    if (!canjeActualizado) {
      return res.status(404).json({
        message: `No se ha encontrado el producto con el id ${id}`,
      });
    }

    res.status(200).json({
      message: "Producto actualizado correctamente",
      canje: canjeActualizado,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getAllCanje = async (req, res) => {
  try {
    const canjes = await canjeModel.find();
    res.json({
      message: "Lista de canjes",
      canjes,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
export const canjear = async (req, res) => {
  try {
    const idUsuario = req.usuario.id;
    const idCanje = req.params.idCanje;

    const productoCanjeado = await canjeModel.findById(idCanje);
    if (!productoCanjeado) {
      return res.status(404).json({ message: "Canje no encontrado" });
    }

    if (productoCanjeado.stock <= 0) {
      return res.status(400).json({
        message: "Lo sentimos, el producto se encuentra sin stock",
      });
    }

    const usuarioDB = await usuarioModel.findById(idUsuario);
    if (!usuarioDB) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    if (usuarioDB.puntos < productoCanjeado.puntos) {
      return res.status(400).json({
        message: "Lo sentimos, aún no tienes puntos suficientes",
      });
    }

    // ✅ Actualización atómica
    await usuarioModel.findByIdAndUpdate(idUsuario, {
      $inc: { puntos: -productoCanjeado.puntos },
    });

    await canjeModel.findByIdAndUpdate(idCanje, {
      $inc: { stock: -1 },
    });

    return res.status(200).json({
      message: "Canje realizado con éxito",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error al realizar el canje" });
  }
};
