import productoModel from "../models/producto.Model.js";

export const createProducto = async (req, res) => {
  const { nombre, precio, descripcion, imagen, stock, categoria, activo } =
    req.body;

  try {
    const producto = await productoModel.create({
      nombre,
      precio,
      descripcion,
      imagen,
      stock,
      categoria,
      empresa: req.usuario.empresa,
    });
    res.status(201).json({
      msg: "Producto creado exitosamente!",
      producto,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteProducto = async (req, res) => {
  const { id } = req.params;
  try {
    const productoEliminado = await productoModel.findByIdAndUpdate(id, {
      activo: false,
    });

    if (!productoEliminado) {
      return res.status(404).json({
        message: `No se ha encontrado el producto con el id ${id}`,
      });
    }
    res.status(200).json({
      message: "Producto actualizado correctamente",
      producto: productoEliminado,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateProducto = async (req, res) => {
  const { id } = req.params;
  const { nombre, precio, descripcion, imagen, stock, categoria } = req.body;

  try {
    const productoActualizado = await productoModel.findByIdAndUpdate(
      id,
      {
        nombre,
        precio,
        descripcion,
        imagen,
        stock,
        categoria,
      },
      {
        new: true, // devuelve el documento actualizado
        runValidators: true, // valida según el schema
      },
    );

    if (!productoActualizado) {
      return res.status(404).json({
        message: `No se ha encontrado el producto con el id ${id}`,
      });
    }

    res.status(200).json({
      message: "Producto actualizado correctamente",
      producto: productoActualizado,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getAllProductos = async (req, res) => {
  try {
    const productos = await productoModel.find({
      empresa: req.usuario.empresaId,
    });

    res.json({ message: "Lista de productos", productos });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
