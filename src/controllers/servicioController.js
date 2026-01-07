import Servicio from "../models/servicio.model.js";

export const getServicios = async (req, res) => {
  try {
    const servicios = await Servicio.find();
    res.json(servicios);
  } catch (error) {}
};

export const createServicio = async (req, res) => {
  try {
    const { nombre, descripcion, precio } = req.body;

    const servicio = await Servicio.create({
      nombre,
      descripcion,
      precio,
    });

    res.status(201).json(servicio);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateServicio = async (req, res) => {
  const { id } = req.params;
  const { descripcion, duracion, nombre, precio } = req.body;
  console.log(descripcion, duracion, nombre, precio);

  try {
    const existeServicio = await Servicio.findById(id);

    if (!existeServicio)
      return res
        .status(400)
        .json({ message: "No hemos encontrado el servicio" });

    await Servicio.findByIdAndUpdate(id, {
      nombre,
      precio,
      duracion,
      descripcion,
    });

    res.json({
      message: "Servicio actualizado correctamente",
      existeServicio,
    });
  } catch (error) {
    console.error("Error al actualizar servicio:", error);
    res
      .status(500)
      .json({ message: "Error del servidor al actualizar servicio" });
  }
};

export const deleteServicio = async (req, res) => {
  const { id } = req.params;
  try {
    const existeServicio = await Servicio.findById(id);
    if (!existeServicio)
      return res
        .status(400)
        .json({ message: "No hemos encontrado el servicio" });

    await Servicio.findByIdAndDelete(id);

    res.status(200).json({
      message: "Servicio eliminado correctamente",
      existeServicio,
    });
  } catch (error) {
    console.error("Error al eliminar servicio:", error);
    res
      .status(500)
      .json({ message: "Error del servidor al eliminar servicio" });
  }
};
