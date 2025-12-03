import reservaModel from "../models/reserva.model.js";
import usuarioModel from "../models/usuario.model.js";

export const totalReservasHoyBarbero = async (req, res) => {
  const userId = req.usuario.id; // este viene del token JWT
  const hoy = new Date();
  const inicio = new Date(hoy);
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date(hoy);
  fin.setHours(23, 59, 59, 999);

  try {
    const total = await reservaModel.countDocuments({
      barbero: userId, // asegúrate de que sea el campo correcto en tu modelo
      fecha: { $gte: inicio, $lte: fin },
    });

    return res.json({ total });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error al contar reservas" });
  }
};

export const totalSuscripcionesActivas = async (req, res) => {
  try {
    const total = await usuarioModel.countDocuments({
      suscrito: true,
    });
    return res.json({ total });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Error al contar suscripciones activas" });
  }
};

export const totalClientes = async (req, res) => {
  try {
    const total = await usuarioModel.countDocuments();
    return res.json({ total });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Error al contar total de clientes" });
  }
};

export const ingresoMensual = async (req, res) => {
  const hoy = new Date();

  // Inicio del mes actual
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  inicioMes.setHours(0, 0, 0, 0);

  // Fin del mes actual
  const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  finMes.setHours(23, 59, 59, 999);

  try {
    const reservasMes = await reservaModel
      .find({
        fecha: { $gte: inicioMes, $lte: finMes },
      })
      .populate("servicio"); // para traer el precio del servicio

    let ingresoTotal = 0;

    reservasMes.forEach((reserva) => {
      if (reserva.servicio && reserva.servicio.precio) {
        ingresoTotal += reserva.servicio.precio;
      }
    });

    res.json({
      ingresoTotal,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Error al obtener Ingreso Mensual" });
  }
};

export const citasEsteMes = async (req, res) => {
  try {
    const userId = req.usuario.id;
    const ahora = new Date();

    // Primer día del mes actual
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    // Primer día del próximo mes
    const inicioProximoMes = new Date(
      ahora.getFullYear(),
      ahora.getMonth() + 1,
      1
    );

    // Verificar si la reserva existe y su fecha
    const reservaEjemplo = await reservaModel.findOne({
      cliente: userId, // o barbero: userId
    });

    if (reservaEjemplo) {
      // Verificar si está en el rango
      const fechaReserva = new Date(reservaEjemplo.fecha);
    }

    const total = await reservaModel.countDocuments({
      cliente: userId, // Asegúrate que sea cliente, no usuario
      fecha: {
        $gte: inicioMes,
        $lt: inicioProximoMes,
      },
    });

    return res.json({
      total,
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: "Error del servidor" });
  }
};

export const ultimaReserva = async (req, res) => {
  try {
    const userId = req.usuario.id;

    const ahoraChile = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Santiago" })
    );

    const ultimaReserva = await reservaModel
      .findOne({
        cliente: userId, // ← ESTE ES EL NOMBRE CORRECTO
        fecha: { $lt: ahoraChile }, // buscar reservas pasadas
      })
      .sort({ fecha: -1 }) // la última primero
      .lean();

    if (!ultimaReserva)
      return res
        .status(400)
        .json({ message: "No se encontraron reservas pasadas" });

    const fechaBonita = ultimaReserva.fecha.toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    return res.json({
      ok: true,
      fecha: fechaBonita, // uniforme para última y próxima
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      ok: false,
      message: "Error obteniendo última reserva",
    });
  }
};

export const proximaReserva = async (req, res) => {
  try {
    const { clienteId } = req.params;

    const ahora = new Date();

    // buscamos reservas con fecha mayor a ahora (futuras)
    const proximaReserva = await reservaModel
      .findOne({
        clienteId,
        fecha: { $gt: ahora },
      })
      .sort({ fecha: 1 }) // la más cercana primero
      .lean();

    if (!proximaReserva)
      return res
        .status(400)
        .json({ message: "Aún no tienes reservas futuras" });

    const fechaBonita = proximaReserva.fecha.toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    return res.json({
      ok: true,
      fecha: fechaBonita, // uniforme para última y próxima
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      ok: false,
      message: "Error obteniendo próxima reserva",
    });
  }
};


