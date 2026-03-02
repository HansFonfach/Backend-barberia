import reservaModel from "../models/reserva.model.js";
import usuarioModel from "../models/usuario.model.js";
import empresaModel from "../models/empresa.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import suscripcionModel from "../models/suscripcion.model.js";
import e from "express";
import mongoose from "mongoose";

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
      estado: { $ne: "cancelada" },
    });

    return res.json({ total });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error al contar reservas" });
  }
};

export const totalSuscripcionesActivas = async (req, res) => {
  try {
    const empresaId = req.usuario?.empresaId;

    if (!empresaId) {
      return res.status(400).json({ message: "Empresa no identificada" });
    }

    const total = await usuarioModel.countDocuments({
      empresaId: empresaId, // 👈 FILTRO POR EMPRESA
      suscrito: true,
    });

    return res.json({ total });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error al contar suscripciones activas",
    });
  }
};

export const totalClientes = async (req, res) => {
  try {
    const empresa = req.usuario?.empresaId;

    if (!empresa) {
      return res.status(400).json({ message: "Empresa no identificada" });
    }
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
    const empresa = req.usuario?.empresaId;

    if (!empresa) {
      return res.status(400).json({ message: "Empresa no identificada" });
    }
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
  const empresa = req.usuario?.empresaId;

  if (!empresa) {
    return res.status(400).json({ message: "Empresa no identificada" });
  }

  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  inicioMes.setHours(0, 0, 0, 0);
  const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  finMes.setHours(23, 59, 59, 999);

  const PRECIO_SUSCRIPCION = 25000;

  try {
    /* =============================
       1. RESERVAS COMPLETADAS
    ============================== */
    const reservasPasadas = await reservaModel
      .find({
        empresa,
        fecha: { $gte: inicioMes, $lte: hoy },
        estado: { $nin: ["cancelada", "no_asistio"] },
      })
      .populate("servicio", "precio");

    let ingresoReservas = 0;

    for (const reserva of reservasPasadas) {
      const precio = reserva.precio || reserva.servicio?.precio || 0;

      const sus = await suscripcionModel.findOne({
        usuario: reserva.cliente,
        empresa,
        fechaInicio: { $lte: reserva.fecha },
        fechaFin: { $gte: reserva.fecha },
      });

      if (!sus) {
        ingresoReservas += precio;
        continue;
      }

      const reservasAnteriores = await reservaModel
        .find({
          empresa,
          cliente: reserva.cliente,
          fecha: { $gte: sus.fechaInicio, $lte: reserva.fecha },
          estado: { $nin: ["cancelada", "no_asistio"] },
        })
        .sort({ fecha: 1 });

      let serviciosAcumulados = 0;
      for (const r of reservasAnteriores) {
        const peso = r.duracion >= 120 ? 2 : 1;
        serviciosAcumulados += peso;
        if (r._id.toString() === reserva._id.toString()) break;
      }

      if (serviciosAcumulados > sus.serviciosTotales) {
        ingresoReservas += precio;
      }
    }

    /* =============================
       2. SUSCRIPCIONES DEL MES
    ============================== */
    const suscripcionesMes = await suscripcionModel.countDocuments({
      empresa,
      fechaInicio: { $gte: inicioMes, $lte: finMes },
    });

    const ingresoSuscripciones = suscripcionesMes * PRECIO_SUSCRIPCION;

    /* =============================
       3. POSIBLE INGRESO (reservas futuras)
    ============================== */
    const reservasFuturas = await reservaModel
      .find({
        empresa,
        fecha: { $gt: hoy, $lte: finMes },
        estado: { $nin: ["cancelada", "no_asistio"] },
      })
      .populate("servicio", "precio");

    let posibleIngreso = 0;

    for (const reserva of reservasFuturas) {
      const precio = reserva.precio || reserva.servicio?.precio || 0;

      const sus = await suscripcionModel.findOne({
        usuario: reserva.cliente,
        empresa,
        fechaInicio: { $lte: reserva.fecha },
        fechaFin: { $gte: reserva.fecha },
      });

      if (!sus) {
        posibleIngreso += precio;
        continue;
      }

      const reservasAnteriores = await reservaModel
        .find({
          empresa,
          cliente: reserva.cliente,
          fecha: { $gte: sus.fechaInicio, $lte: reserva.fecha },
          estado: { $nin: ["cancelada", "no_asistio"] },
        })
        .sort({ fecha: 1 });

      let serviciosAcumulados = 0;
      for (const r of reservasAnteriores) {
        const peso = r.duracion >= 120 ? 2 : 1;
        serviciosAcumulados += peso;
        if (r._id.toString() === reserva._id.toString()) break;
      }

      if (serviciosAcumulados > sus.serviciosTotales) {
        posibleIngreso += precio;
      }
    }

    /* =============================
       4. RESPUESTA
    ============================== */
    res.json({
      ingresoTotal: ingresoReservas + ingresoSuscripciones,
      detalle: {
        ingresoReservas,
        ingresoSuscripciones,
        suscripcionesNuevas: suscripcionesMes,
        posibleIngreso: ingresoReservas + ingresoSuscripciones + posibleIngreso,
      },
    });
  } catch (error) {
    console.error("❌ Error ingresoMensual:", error);
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
      1,
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
      new Date().toLocaleString("en-US", { timeZone: "America/Santiago" }),
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
    const barberoId = req.usuario.id;
    const empresaId = req.usuario.empresaId; // 🔐 CLAVE

    const reserva = await reservaModel
      .findOne({
        empresa: empresaId,
        barbero: barberoId,
        estado: "pendiente",
        fecha: { $gt: ahora },
      })
      .sort({ fecha: 1 })
      .populate("cliente", "nombre apellido")
      .lean();

    if (!reserva) {
      return res.status(200).json({
        success: false,
        message: "No hay próximas reservas pendientes",
      });
    }

    const fechaChile = dayjs(reserva.fecha).tz("America/Santiago");

    return res.status(200).json({
      success: true,
      data: {
        fecha: fechaChile.format("YYYY-MM-DD"),
        hora: fechaChile.format("HH:mm"),
        cliente: {
          nombreCompleto: `${reserva.cliente?.nombre || ""} ${
            reserva.cliente?.apellido || ""
          }`.trim(),
        },
      },
    });
  } catch (error) {
    console.error("Error obteniendo próxima reserva:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

export const ingresoTotal = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;

    const resultado = await reservaModel.aggregate([
      {
        $match: {
          estado: "completada",
          empresa: new mongoose.Types.ObjectId(empresaId), // ← "empresa" no "empresaId"
        },
      },
      {
        $lookup: {
          from: "servicios",
          localField: "servicio", // ← "servicio" no "servicioId"
          foreignField: "_id",
          as: "servicioData",
        },
      },
      {
        $unwind: "$servicioData",
      },
      {
        $group: {
          _id: null,
          totalIngresos: { $sum: "$servicioData.precio" },
        },
      },
    ]);

    const total = resultado.length > 0 ? resultado[0].totalIngresos : 0;
    res.json({ totalIngresos: total });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al calcular el ingreso total" });
  }
};

export const reservasCompletadas = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;

    const total = await reservaModel.countDocuments({
      estado: "completada",
      empresa: new mongoose.Types.ObjectId(empresaId),
    });

    res.json({ reservasCompletadas: total });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Error al contar las reservas completadas" });
  }
};

export const reservasCanceladas = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;

    const total = await reservaModel.countDocuments({
      estado: "cancelada",
      empresa: new mongoose.Types.ObjectId(empresaId),
    });

    res.json({ reservasCanceladas: total });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Error al contar las reservas completadas" });
  }
};
export const reservasNoAsistidas = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;

    const total = await reservaModel.countDocuments({
      estado: "no_asistio",
      empresa: new mongoose.Types.ObjectId(empresaId),
    });

    res.json({ reservasNoAsistidas: total });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Error al contar las reservas completadas" });
  }
};

export const horaMasSolicitada = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;

    const resultado = await reservaModel.aggregate([
      {
        $match: {
          empresa: new mongoose.Types.ObjectId(empresaId),
          estado: { $in: ["completada", "confirmada", "pendiente"] },
        },
      },
      {
        $group: {
          _id: { $hour: "$fecha" },
          total: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 1 },
    ]);

    if (resultado.length === 0) {
      return res.json({ horaMasSolicitada: null });
    }

    const hora = resultado[0]._id;

    res.json({
      horaMasSolicitada: `${hora}:00 - ${hora + 1}:00`,
      totalReservas: resultado[0].total,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Error al obtener la hora más solicitada" });
  }
};

export const horaMasCancelada = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;

    const resultado = await reservaModel.aggregate([
      {
        $match: {
          empresa: new mongoose.Types.ObjectId(empresaId),
          estado: "cancelada",
        },
      },
      {
        $group: {
          _id: {
            $hour: {
              date: "$fecha",
              timezone: "America/Argentina/Buenos_Aires",
            },
          },
          total: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 1 },
    ]);

    if (resultado.length === 0) return res.json({ horaMasCancelada: null });

    const hora = resultado[0]._id;
    res.json({
      horaMasCancelada: `${hora}:00 - ${hora + 1}:00`,
      totalCancelaciones: resultado[0].total,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener la hora más cancelada" });
  }
};

export const servicioMasPopular = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;

    const resultado = await reservaModel.aggregate([
      {
        $match: {
          empresa: new mongoose.Types.ObjectId(empresaId),
          estado: { $in: ["completada", "confirmada", "pendiente"] },
        },
      },
      {
        $group: {
          _id: "$servicio",
          total: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 1 },
      {
        $lookup: {
          from: "servicios",
          localField: "_id",
          foreignField: "_id",
          as: "servicio",
        },
      },
      { $unwind: "$servicio" },
      {
        $project: {
          nombre: "$servicio.nombre",
          precio: "$servicio.precio",
          totalReservas: "$total",
        },
      },
    ]);

    if (resultado.length === 0) return res.json({ servicioMasPopular: null });

    res.json({ servicioMasPopular: resultado[0] });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Error al obtener el servicio más popular" });
  }
};

export const tasaDeCancelacion = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;

    const [total, canceladas] = await Promise.all([
      reservaModel.countDocuments({
        empresa: new mongoose.Types.ObjectId(empresaId),
        estado: { $in: ["completada", "cancelada", "no_asistio"] }, // solo las "cerradas"
      }),
      reservaModel.countDocuments({
        empresa: new mongoose.Types.ObjectId(empresaId),
        estado: "cancelada",
      }),
    ]);

    const tasa = total === 0 ? 0 : ((canceladas / total) * 100).toFixed(2);

    res.json({
      totalReservas: total,
      canceladas,
      tasaCancelacion: `${tasa}%`,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Error al calcular la tasa de cancelación" });
  }
};

export const tasaDeAsistencia = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;

    const ahora = new Date();

    const [total, completadas, noAsistio] = await Promise.all([
      reservaModel.countDocuments({
        empresa: new mongoose.Types.ObjectId(empresaId),
        fecha: { $lt: ahora }, // solo reservas que ya pasaron
        estado: { $in: ["completada", "no_asistio", "cancelada"] },
      }),
      reservaModel.countDocuments({
        empresa: new mongoose.Types.ObjectId(empresaId),
        estado: "completada",
      }),
      reservaModel.countDocuments({
        empresa: new mongoose.Types.ObjectId(empresaId),
        estado: "no_asistio",
      }),
    ]);

    const tasa = total === 0 ? 0 : ((completadas / total) * 100).toFixed(2);

    res.json({
      totalReservas: total,
      completadas,
      noAsistio,
      tasaAsistencia: `${tasa}%`,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Error al calcular la tasa de asistencia" });
  }
};
