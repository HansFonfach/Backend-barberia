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
      const { servicioId, duracion, activo } = item; // 👈 desestructurar también activo

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
          activo: activo !== false, // 👈 default true si no viene, pero respeta false explícito
        },
        {
          upsert: true,
          new: true,
        },
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
      .populate("servicio", "nombre descripcion");

    const response = servicios
      .filter((s) => s.servicio)
      .map((s) => ({
        id: s._id,
        servicioId: s.servicio._id,
        nombre: s.servicio.nombre,
        descripcion: s.servicio.descripcion,
        duracion: s.duracion,
        horasPermitidas: s.horasPermitidas || [], // 👈 agregar esta línea
      }));

    res.json(response);
  } catch (error) {
    console.error(error); // 👈 agregá esto para ver el error real en la terminal
    res
      .status(500)
      .json({ message: "Error obteniendo servicios", error: error.message });
  }
};

// Agregar a barberoServicioController.js

export const actualizarHorasPermitidas = async (req, res) => {
  try {
    const { barberoId, servicioId } = req.params;
    const { horasPermitidas } = req.body;

    if (!Array.isArray(horasPermitidas)) {
      return res
        .status(400)
        .json({ message: "horasPermitidas debe ser un array" });
    }

    // Validar formato HH:mm de cada hora
    const formatoValido = horasPermitidas.every((h) =>
      /^([01]\d|2[0-3]):([0-5]\d)$/.test(h),
    );
    if (!formatoValido) {
      return res
        .status(400)
        .json({ message: "Alguna hora no tiene formato HH:mm válido" });
    }

    const servicio = await servicioModel.findById(servicioId);
    if (!servicio) {
      return res.status(404).json({ message: "El servicio no existe" });
    }

    const barberoServicio = await barberoServicioModel.findOneAndUpdate(
      {
        barbero: barberoId,
        servicio: servicioId,
      },
      {
        horasPermitidas,
      },
      {
        new: true,
        upsert: false, // 👈 no creamos la relación si no existía, debe asignarse el servicio primero
      },
    );

    if (!barberoServicio) {
      return res.status(404).json({
        message: "Este servicio no está asignado a este barbero todavía",
      });
    }

    return res.json({
      message: "Horas permitidas actualizadas correctamente",
      barberoServicio,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error actualizando horas permitidas",
      error: error.message,
    });
  }
};


// Agregar a barberoServicioController.js

export const actualizarHorasPermitidasBatch = async (req, res) => {
  try {
    const { barberoId } = req.params;
    const { actualizaciones } = req.body; // [{ servicioId, horasPermitidas }]

    if (!Array.isArray(actualizaciones) || actualizaciones.length === 0) {
      return res.status(400).json({ message: "No se enviaron actualizaciones" });
    }

    const formatoHora = /^([01]\d|2[0-3]):([0-5]\d)$/;
    const resultados = [];

    for (const item of actualizaciones) {
      const { servicioId, horasPermitidas } = item;

      if (!Array.isArray(horasPermitidas)) {
        return res
          .status(400)
          .json({ message: `horasPermitidas inválido para servicio ${servicioId}` });
      }
      if (!horasPermitidas.every((h) => formatoHora.test(h))) {
        return res
          .status(400)
          .json({ message: `Hora con formato inválido en servicio ${servicioId}` });
      }

      const barberoServicio = await barberoServicioModel.findOneAndUpdate(
        { barbero: barberoId, servicio: servicioId },
        { horasPermitidas },
        { new: true, upsert: false },
      );

      if (!barberoServicio) {
        return res.status(404).json({
          message: `El servicio ${servicioId} no está asignado a este barbero`,
        });
      }

      resultados.push(barberoServicio);
    }

    return res.json({
      message: "Horas permitidas actualizadas correctamente",
      servicios: resultados,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error actualizando horas permitidas",
      error: error.message,
    });
  }
};