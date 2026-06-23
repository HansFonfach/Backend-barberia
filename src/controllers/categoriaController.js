import categoriaModel from "../models/categoria.model.js";
import empresaModel from "../models/empresa.model.js";

export const crearCategoria = async (req, res) => {
  try {

    const { nombre, orden } = req.body;

    const empresaId = req.usuario.empresaId;

    const categoriaExistente = await categoriaModel.findOne({
      nombre,
      empresaId,
    });

    if (categoriaExistente) {
      return res.status(400).json({
        msg: "Ya existe la categoría creada",
      });
    }

    const categoriaCreada = await categoriaModel.create({
      nombre,
      orden,
      empresaId,
    });

    return res.status(201).json(categoriaCreada);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      msg: "Error al crear categoría",
    });
  }
};

export const listarCategorias = async (req, res) => {
  try {
    const { slug } = req.params;

    const empresa = await empresaModel.findOne({ slug });

    if (!empresa) {
      return res.status(404).json({ msg: "Empresa no encontrada" });
    }

    const categorias = await categoriaModel
      .find({ empresaId: empresa._id, activa: true })
      .sort({ orden: 1, nombre: 1 });

    return res.json(categorias);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      msg: "Error al listar categorías",
    });
  }
};

export const editarCategoria = () => {};

export const eliminarCategoria = () => {};
