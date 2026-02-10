import barberoServicioModel from "../models/barberoServicio.model.js";
import servicioModel from "../models/servicio.model.js";
import usuarioModel from "../models/usuario.model.js";


export const asignarServiciosBarbero = async (req, res) => {
  try {
    const { barberoId } = req.params;
    const servicios = req.body; // 👈 array

    if (!Array.isArray(servicios) || servicios.length === 0) {
      return res.status(400).json({ message: "No se enviaron servicios" });
    }

    // Validar barbero
    const barbero = await usuarioModel.findById(barberoId);
    if (!barbero || barbero.rol !== "barbero") {
      return res.status(400).json({ message: "Usuario no es barbero" });
    }

    const resultados = [];

    for (const item of servicios) {
      const { servicioId, duracion } = item;

      // validar servicio
      const servicio = await servicioModel.findById(servicioId);
      if (!servicio) {
        return res
          .status(404)
          .json({ message: `El servicio ${servicioId} no existe` });
      }

      const barberoServicio = await barberoServicioModel.findOneAndUpdate(
        {
          barbero: barberoId,
          servicio: servicioId,
        },
        {
          duracion,
          activo: true,
        },
        {
          upsert: true,
          new: true,
        }
      );

      resultados.push(barberoServicio);
    }

    return res.json({
      message: "Servicios asignados correctamente",
      servicios: resultados,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error asignando servicios",
      error,
    });
  }
};
export const obtenerServiciosDeBarbero = async (req, res) => {
  try {
    const { barberoId } = req.params;

    const servicios = await barberoServicioModel
      .find({
        barbero: barberoId,
        activo: true,
      })
      .populate("servicio", "nombre, descripcion");

    const response = servicios.map((s) => ({
      id: s._id,
      servicioId: s.servicio._id,
      nombre: s.servicio.nombre,
      descripcion: s.servicio.descripcion,
      duracion: s.duracion,
    }));

    res.json(response);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo servicios", error });
  }
};
