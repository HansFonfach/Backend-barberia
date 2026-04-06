import barberoServicioModel from "../models/barberoServicio.model.js";
import empresaModel from "../models/empresa.model.js";
import Servicio from "../models/servicio.model.js";

/**
 * Obtener todos los servicios de la empresa del usuario
 */
export const getServicios = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId; // ✅ del token
    if (!empresaId) {
      return res
        .status(400)
        .json({ message: "No se pudo identificar la empresa del usuario" });
    }

    const servicios = await Servicio.find({ empresa: empresaId }).sort({
      precio: 1,
    }); // 👈 ASC
    res.json(servicios);
  } catch (error) {
    console.error("Error al obtener servicios:", error);
    res.status(500).json({ message: error.message });
  }
};
/**
 * Crear nuevo servicio ligado a la empresa del usuario
 */
export const createServicio = async (req, res) => {
  try {
    const { nombre, descripcion, precio } = req.body;
    const empresaId = req.usuario.empresaId; // ✅ viene del token

    if (!empresaId) {
      return res
        .status(400)
        .json({ message: "No se pudo identificar la empresa del usuario" });
    }

    const servicio = await Servicio.create({
      empresa: empresaId, // ✅ aquí se asigna correctamente
      nombre,
      descripcion,
      precio,
    });

    res.status(201).json(servicio);
  } catch (error) {
    console.error("Error al crear servicio:", error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * Actualizar servicio (solo de la empresa del usuario)
 */
export const updateServicio = async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, precio, duracion } = req.body;

  try {
    // Buscar servicio dentro de la empresa del usuario
    const servicio = await Servicio.findOne({
      _id: id,
      empresa: req.usuario.empresaId, // ✅
    });
    if (!servicio) {
      return res.status(404).json({ message: "Servicio no encontrado" });
    }

    servicio.nombre = nombre || servicio.nombre;
    servicio.descripcion = descripcion || servicio.descripcion;
    servicio.precio = precio !== undefined ? precio : servicio.precio;
    servicio.duracion = duracion !== undefined ? duracion : servicio.duracion;

    await servicio.save();

    res.json({ message: "Servicio actualizado correctamente", servicio });
  } catch (error) {
    console.error("Error al actualizar servicio:", error);
    res
      .status(500)
      .json({ message: "Error del servidor al actualizar servicio" });
  }
};

/**
 * Eliminar servicio (solo de la empresa del usuario)
 */
export const deleteServicio = async (req, res) => {
  const { id } = req.params;

  try {
    const servicio = await Servicio.findOneAndDelete({
      _id: id,
      empresa: req.usuario.empresaId, // ✅
    });
    if (!servicio) {
      return res.status(404).json({ message: "Servicio no encontrado" });
    }

    res.json({ message: "Servicio eliminado correctamente", servicio });
  } catch (error) {
    console.error("Error al eliminar servicio:", error);
    res
      .status(500)
      .json({ message: "Error del servidor al eliminar servicio" });
  }
};

export const getServiciosPublicos = async (req, res) => {
  const { slug } = req.params;

  try {
    // 1️⃣ Buscar empresa
    const empresa = await empresaModel.findOne({ slug });

    if (!empresa) {
      return res.status(404).json({
        message: "Empresa no encontrada",
      });
    }

    // 2️⃣ Buscar relaciones barbero-servicio
    const barberoServicios = await barberoServicioModel.find({
      activo: true,
    })
      .populate({
        path: "servicio",
        match: { empresa: empresa._id }, // 👈 FILTRAS POR EMPRESA AQUÍ
      })
      .lean();

    // 3️⃣ Filtrar los que sí tienen servicio válido
    const filtrados = barberoServicios.filter((bs) => bs.servicio);

    // 4️⃣ Transformar data (🔥 aquí unes todo)
    const serviciosMap = {};

    filtrados.forEach((bs) => {
      const id = bs.servicio._id.toString();

      if (!serviciosMap[id]) {
        serviciosMap[id] = {
          ...bs.servicio,
          duraciones: [],
        };
      }

      serviciosMap[id].duraciones.push(bs.duracion);
    });

    // 5️⃣ Calcular duración final (puedes elegir estrategia)
    const servicios = Object.values(serviciosMap).map((s) => ({
      ...s,
      duracionMin: Math.min(...s.duraciones),
      duracionMax: Math.max(...s.duraciones),
    }));

    // 6️⃣ Ordenar por precio
    servicios.sort((a, b) => a.precio - b.precio);

    res.json({
      servicios,
    });
  } catch (error) {
    console.error("❌ Error al obtener servicios públicos:", error);
    res.status(500).json({
      message: "Error al obtener servicios",
    });
  }
};
