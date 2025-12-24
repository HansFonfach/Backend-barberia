import reservaModel from "../models/reserva.model.js";
import usuarioModel from "../models/usuario.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

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

export const reservasTotales = async (req, res) => {
  try {
    const total = await reservaModel.countDocuments();
    return res.json({ total });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Error al contar total de reservas" });
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

export const ingresoPorFecha = (req, res) => {};

export const getTop5Clientes = async (req, res) => {
  try {
    // Pipeline para top clientes - SIN filtrar por estado
    const pipeline = [
      // Obtener datos del cliente (todas las reservas)
      {
        $lookup: {
          from: "usuarios",
          localField: "cliente",
          foreignField: "_id",
          as: "clienteInfo",
        },
      },
      { $unwind: "$clienteInfo" },
      // Filtrar solo clientes (no barberos/admins)
      {
        $match: {
          "clienteInfo.rol": "cliente",
          // Quitamos el filtro de estado: "clienteInfo.estado": "activo"
        },
      },
      // Obtener precio del servicio
      {
        $lookup: {
          from: "servicios",
          localField: "servicio",
          foreignField: "_id",
          as: "servicioInfo",
        },
      },
      { $unwind: "$servicioInfo" },
      // Ahora agrupar por cliente
      {
        $group: {
          _id: "$cliente",
          totalReservas: { $sum: 1 },
          totalGastado: { $sum: "$servicioInfo.precio" },
          nombre: { $first: "$clienteInfo.nombre" },
          apellido: { $first: "$clienteInfo.apellido" },
          email: { $first: "$clienteInfo.email" },
        },
      },
      // Ordenar por total gastado
      {
        $sort: { totalGastado: -1 },
      },
      // Limitar a 5
      {
        $limit: 5,
      },
    ];

    const topClientes = await reservaModel.aggregate(pipeline);

    // Calcular total general de ventas - SIN filtrar por estado
    const totalVentasPipeline = [
      {
        $lookup: {
          from: "servicios",
          localField: "servicio",
          foreignField: "_id",
          as: "servicioInfo",
        },
      },
      { $unwind: "$servicioInfo" },
      {
        $group: {
          _id: null,
          total: { $sum: "$servicioInfo.precio" },
          totalReservas: { $sum: 1 },
        },
      },
    ];

    const totalVentasResult = await reservaModel.aggregate(totalVentasPipeline);
    const ventasTotales = totalVentasResult[0]?.total || 0;
    const totalReservasSistema = totalVentasResult[0]?.totalReservas || 0;

    // Formateador de moneda chilena
    const formatter = new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    });

    // Formatear resultados
    const resultado = topClientes.map((cliente) => {
      const porcentaje =
        ventasTotales > 0 ? (cliente.totalGastado / ventasTotales) * 100 : 0;

      return {
        id: cliente._id,
        nombre: cliente.nombre,
        apellido: cliente.apellido,
        email: cliente.email,
        totalReservas: cliente.totalReservas,
        totalGastado: cliente.totalGastado,
        totalGastadoFormateado: formatter.format(cliente.totalGastado),
        porcentaje: Math.round(porcentaje * 10) / 10, // 1 decimal
        // String formateado para mostrar
        display: `${cliente.nombre} ${cliente.apellido || ""}
${cliente.totalReservas} reservas • ${formatter.format(cliente.totalGastado)}
${Math.round(porcentaje * 10) / 10}%`,
      };
    });

    res.json({
      success: true,
      data: resultado,
      estadisticasGenerales: {
        totalVentas: ventasTotales,
        totalVentasFormateado: formatter.format(ventasTotales),
        totalReservas: totalReservasSistema,
        cantidadClientesTop: resultado.length,
      },
      message:
        resultado.length === 0
          ? "No hay reservas en el sistema"
          : "Datos obtenidos correctamente",
    });
  } catch (error) {
    console.error("Error en getTopClientesDashboard:", error);
    res.status(500).json({
      success: false,
      message: "Error del servidor",
      error: error.message,
    });
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
    const clienteId = req.usuario.id;
    console.log(clienteId);

    const ahora = new Date();

    // buscamos reservas con fecha mayor a ahora (futuras)
    const proximaReserva = await reservaModel
      .findOne({
        cliente: clienteId,
        fecha: { $gt: ahora },
      })
      .sort({ fecha: 1 }) // la más cercana primero
      .lean();

    if (!proximaReserva)
      return res
        .status(400)
        .json({ message: "Aún no tienes reservas futuras" });

    const fechaBonita = new Date(proximaReserva.fecha).toLocaleString("es-CL", {
      timeZone: "America/Santiago",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return res.json({
      ok: true,
      fecha: fechaBonita,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      ok: false,
      message: "Error obteniendo próxima reserva",
    });
  }
};

export const getHoraMasSolicitada = async (req, res) => {
  try {
    const pipeline = [
      // Convertir string a Date si es necesario
      {
        $addFields: {
          fechaDate: {
            $cond: {
              if: { $eq: [{ $type: "$fecha" }, "string"] },
              then: { $dateFromString: { dateString: "$fecha" } },
              else: "$fecha",
            },
          },
        },
      },
      // Extraer hora
      { $addFields: { hora: { $hour: "$fechaDate" } } },
      // Agrupar
      { $group: { _id: "$hora", total: { $sum: 1 } } },
      // Ordenar
      { $sort: { total: -1 } },
      // Limitar a 1
      { $limit: 1 },
      // Formatear
      {
        $project: {
          hora: "$_id",
          totalReservas: "$total",
          hora24: { $concat: [{ $toString: "$_id" }, ":00"] },
          hora12: {
            $concat: [
              {
                $cond: {
                  if: { $eq: ["$_id", 0] },
                  then: "12",
                  else: {
                    $cond: {
                      if: { $gt: ["$_id", 12] },
                      then: { $toString: { $subtract: ["$_id", 12] } },
                      else: { $toString: "$_id" },
                    },
                  },
                },
              },
              ":00 ",
              { $cond: { if: { $lt: ["$_id", 12] }, then: "AM", else: "PM" } },
            ],
          },
          _id: 0,
        },
      },
    ];

    const resultado = await reservaModel.aggregate(pipeline);
    const totalReservas = await reservaModel.countDocuments();

    if (resultado.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: "No hay reservas para analizar",
      });
    }

    const horaPico = resultado[0];

    res.json({
      success: true,
      data: {
        horaPico: horaPico.hora12,
        hora24: horaPico.hora24,
        horaNumero: horaPico.hora,
        totalReservasEnHoraPico: horaPico.totalReservas,
        totalReservasSistema: totalReservas,
        porcentaje:
          Math.round((horaPico.totalReservas / totalReservas) * 100 * 10) / 10 +
          "%",
        rangoHorario: `${horaPico.hora}:00 - ${horaPico.hora + 1}:00`,
        // Mensaje amigable
        mensaje: `La hora más solicitada es ${horaPico.hora12} con ${horaPico.totalReservas} de ${totalReservas} reservas totales`,
      },
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      message: "Error calculando hora pico",
    });
  }
};

export const getProximoCliente = async (req, res) => {
  try {
    const ahora = new Date();

    // Buscar próxima reserva
    const reserva = await reservaModel
      .findOne({ fecha: { $gt: ahora } })
      .sort({ fecha: 1 })
      .populate("cliente", "nombre apellido")
      .lean();

    if (!reserva) {
      return res.status(200).json({
        success: false,
        message: "No hay próximas reservas",
      });
    }

    // Convertir UTC → Hora Chile
    const fechaChile = dayjs(reserva.fecha).tz("America/Santiago");

    const fecha = fechaChile.format("YYYY-MM-DD"); // 2025-12-04
    const hora = fechaChile.format("HH:mm"); // 19:00

    return res.status(200).json({
      success: true,
      data: {
        fecha,
        hora,
        cliente: {
          nombreCompleto: `${reserva.cliente?.nombre || ""} ${
            reserva.cliente?.apellido || ""
          }`.trim(),
        },
      },
    });
  } catch (error) {
    console.error("Error obteniendo próxima reserva:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error interno del servidor" });
  }
};
