import barberoServicioModel from "../models/barberoServicio.model.js";
import empresaModel from "../models/empresa.model.js";
import Servicio from "../models/servicio.model.js";
import { calcularPrecioServicio } from "../utils/calcularPreciosServicios.js";

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
    const { nombre, descripcion, precio, instrucciones, cuidados } = req.body;
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
      instrucciones,
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

  const {
    nombre,
    descripcion,
    precio,
    duracion,
    instrucciones,
    cuidados,
    categoriaId,
    descuento, // 👈 nuevo: { activo, porcentaje, descripcion, fechaInicio, fechaFin }
  } = req.body;

  console.log(descuento);

  try {
    const servicio = await Servicio.findOne({
      _id: id,
      empresa: req.usuario.empresaId,
    });

    if (!servicio) {
      return res.status(404).json({ message: "Servicio no encontrado" });
    }

    servicio.nombre = nombre || servicio.nombre;
    servicio.descripcion = descripcion || servicio.descripcion;
    servicio.precio = precio !== undefined ? precio : servicio.precio;
    servicio.duracion = duracion !== undefined ? duracion : servicio.duracion;
    servicio.instrucciones =
      instrucciones !== undefined ? instrucciones : servicio.instrucciones;
    servicio.cuidados = cuidados !== undefined ? cuidados : servicio.cuidados;

    servicio.categoria = categoriaId || servicio.categoria;

    if (
      descuento?.fechaInicio &&
      descuento?.fechaFin &&
      new Date(descuento.fechaInicio) > new Date(descuento.fechaFin)
    ) {
      return res.status(400).json({
        message: "La fecha de inicio no puede ser posterior a la fecha de fin",
      });
    }

    // 👇 NUEVO: actualizar descuento campo por campo, sin pisar lo que no venga
    if (descuento !== undefined) {
      if (descuento.activo !== undefined) {
        servicio.descuento.activo = descuento.activo;
      }
      if (descuento.porcentaje !== undefined) {
        servicio.descuento.porcentaje = descuento.porcentaje;
      }
      if (descuento.descripcion !== undefined) {
        servicio.descuento.descripcion = descuento.descripcion;
      }
      if (descuento.fechaInicio !== undefined) {
        servicio.descuento.fechaInicio = descuento.fechaInicio
          ? new Date(descuento.fechaInicio)
          : null;
      }
      if (descuento.fechaFin !== undefined) {
        servicio.descuento.fechaFin = descuento.fechaFin
          ? new Date(descuento.fechaFin)
          : null;
      }
    }

    await servicio.save();

    return res.json({
      message: "Servicio actualizado correctamente",
      servicio,
    });
  } catch (error) {
    console.error("Error al actualizar servicio:", error);
    return res.status(500).json({
      message: "Error del servidor al actualizar servicio",
    });
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
  const { fecha } = req.query;

  console.log(fecha);

  try {
    const empresa = await empresaModel.findOne({ slug });

    if (!empresa) {
      return res.status(404).json({
        message: "Empresa no encontrada",
      });
    }

    const barberoServicios = await barberoServicioModel
      .find({
        activo: true,
      })
      .populate({
        path: "servicio",
        match: { empresa: empresa._id },
        populate: {
          path: "categoria", // 👈 singular, coincide con el campo real del schema
          select: "nombre orden",
        },
      })
      .lean();

    const filtrados = barberoServicios.filter((bs) => bs.servicio);

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

    const fechaReserva = fecha ? new Date(fecha) : null;

    const servicios = Object.values(serviciosMap).map((s) => ({
      ...s,
      precioFinal: calcularPrecioServicio(s, fechaReserva),
      duracionMin: Math.min(...s.duraciones),
      duracionMax: Math.max(...s.duraciones),
    }));
    servicios.sort((a, b) => a.precioFinal - b.precioFinal);

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
