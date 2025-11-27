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
      ingresoTotal
    })
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Error al obtener Ingreso Mensual" });
  }
};
