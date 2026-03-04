import reservaModel from "../models/reserva.model.js";
import usuarioModel from "../models/usuario.model.js";
import empresaModel from "../models/empresa.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import suscripcionModel from "../models/suscripcion.model.js";
import mongoose from "mongoose";

dayjs.extend(utc);
dayjs.extend(timezone);

/* =====================================================
   UTIL
===================================================== */
const ok = (res, data) => res.json({ ok: true, data });
const err = (res, msg, status = 500) =>
  res.status(status).json({ ok: false, message: msg });

/* =====================================================
   RESERVAS HOY (BARBERO)
===================================================== */
export const totalReservasHoyBarbero = async (req, res) => {
  try {
    const userId = req.usuario.id;
    const hoy = new Date();
    const inicio = new Date(hoy);
    inicio.setHours(0, 0, 0, 0);
    const fin = new Date(hoy);
    fin.setHours(23, 59, 59, 999);

    const total = await reservaModel.countDocuments({
      barbero: userId,
      fecha: { $gte: inicio, $lte: fin },
      estado: { $ne: "cancelada" },
    });

    return ok(res, { total });
  } catch (error) {
    console.error(error);
    return err(res, "Error al contar reservas de hoy");
  }
};

/* =====================================================
   SUSCRIPCIONES ACTIVAS
===================================================== */
export const totalSuscripcionesActivas = async (req, res) => {
  try {
    const empresaId = req.usuario?.empresaId;
    if (!empresaId) return err(res, "Empresa no identificada", 400);

    const total = await suscripcionModel.countDocuments({
      empresa: empresaId,
      activa: true,
      fechaFin: { $gte: new Date() },
    });

    return ok(res, { total });
  } catch (error) {
    console.error(error);
    return err(res, "Error al contar suscripciones activas");
  }
};

/* =====================================================
   TOTAL CLIENTES (filtrado por empresa)
===================================================== */
export const totalClientes = async (req, res) => {
  try {
    const empresaId = req.usuario?.empresaId;
    if (!empresaId) return err(res, "Empresa no identificada", 400);

    const total = await usuarioModel.countDocuments({
      empresa: new mongoose.Types.ObjectId(empresaId),
      rol: "cliente",
      estado: "activo",
    });

    return ok(res, { total });
  } catch (error) {
    console.error(error);
    return err(res, "Error al contar clientes");
  }
};

/* =====================================================
   CITAS ESTE MES (CLIENTE)
===================================================== */
export const citasEsteMes = async (req, res) => {
  try {
    const empresaId = req.usuario?.empresaId;
    if (!empresaId) return err(res, "Empresa no identificada", 400);

    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const inicioProximoMes = new Date(
      ahora.getFullYear(),
      ahora.getMonth() + 1,
      1,
    );

    const total = await reservaModel.countDocuments({
      empresa: new mongoose.Types.ObjectId(empresaId),
      fecha: { $gte: inicioMes, $lt: inicioProximoMes },
      estado: { $ne: "cancelada" },
    });

    return ok(res, { total });
  } catch (error) {
    console.error(error);
    return err(res, "Error al contar citas del mes");
  }
};

/* =====================================================
   ÚLTIMA RESERVA (CLIENTE)
===================================================== */
export const ultimaReserva = async (req, res) => {
  try {
    const userId = req.usuario.id;

    const ahoraChile = new Date(
      new Date().toLocaleString("en-US", {
        timeZone: "America/Santiago",
      }),
    );

    const reserva = await reservaModel
      .findOne({ cliente: userId, fecha: { $lt: ahoraChile } })
      .sort({ fecha: -1 })
      .lean();

    if (!reserva) return err(res, "No se encontraron reservas pasadas", 404);

    const fechaChile = new Date(reserva.fecha).toLocaleString("es-CL", {
      timeZone: "America/Santiago",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Separar fecha y hora
    const [fecha, hora] = fechaChile.split(", ");

    return ok(res, { fecha, hora });
  } catch (error) {
    console.error(error);
    return err(res, "Error obteniendo última reserva");
  }
};

/* =====================================================
   PRÓXIMA RESERVA (CLIENTE)
===================================================== */
export const proximaReserva = async (req, res) => {
  try {
    const clienteId = req.usuario.id;

    const ahoraChile = new Date(
      new Date().toLocaleString("en-US", {
        timeZone: "America/Santiago",
      }),
    );

    const reserva = await reservaModel
      .findOne({
        cliente: clienteId,
        fecha: { $gt: ahoraChile },
        estado: "pendiente",
      })
      .sort({ fecha: 1 })
      .lean();

    if (!reserva) return err(res, "Aún no tienes reservas futuras", 404);

    const fechaChile = new Date(reserva.fecha).toLocaleString("es-CL", {
      timeZone: "America/Santiago",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const [fecha, hora] = fechaChile.split(", ");

    return ok(res, { fecha, hora });
  } catch (error) {
    console.error(error);
    return err(res, "Error obteniendo próxima reserva");
  }
};

/* =====================================================
   PRÓXIMO CLIENTE (BARBERO)
===================================================== */
export const getProximoCliente = async (req, res) => {
  try {
    const barberoId = req.usuario.id;
    const empresaId = req.usuario.empresaId;
    const ahora = new Date();

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

    if (!reserva) return ok(res, null);

    const fechaChile = dayjs(reserva.fecha).tz("America/Santiago");

    return ok(res, {
      fecha: fechaChile.format("YYYY-MM-DD"),
      hora: fechaChile.format("HH:mm"),
      cliente: {
        nombreCompleto:
          `${reserva.cliente?.nombre || ""} ${reserva.cliente?.apellido || ""}`.trim(),
      },
    });
  } catch (error) {
    console.error(error);
    return err(res, "Error obteniendo próximo cliente");
  }
};

/* =====================================================
   INGRESO MENSUAL
===================================================== */
export const ingresoMensual = async (req, res) => {
  const empresaId = req.usuario?.empresaId;
  if (!empresaId) return err(res, "Empresa no identificada", 400);

  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  inicioMes.setHours(0, 0, 0, 0);
  const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  finMes.setHours(23, 59, 59, 999);

  const PRECIO_SUSCRIPCION = 25000;

  try {
    const reservasPasadas = await reservaModel
      .find({
        empresa: empresaId,
        fecha: { $gte: inicioMes, $lte: hoy },
        estado: { $nin: ["cancelada", "no_asistio"] },
      })
      .populate("servicio", "precio");

    let ingresoReservas = 0;
    for (const reserva of reservasPasadas) {
      const precio = reserva.precio || reserva.servicio?.precio || 0;
      const sus = await suscripcionModel.findOne({
        usuario: reserva.cliente,
        empresa: empresaId,
        fechaInicio: { $lte: reserva.fecha },
        fechaFin: { $gte: reserva.fecha },
      });

      if (!sus) {
        ingresoReservas += precio;
        continue;
      }

      const reservasAnteriores = await reservaModel
        .find({
          empresa: empresaId,
          cliente: reserva.cliente,
          fecha: { $gte: sus.fechaInicio, $lte: reserva.fecha },
          estado: { $nin: ["cancelada", "no_asistio"] },
        })
        .sort({ fecha: 1 });

      let serviciosAcumulados = 0;
      for (const r of reservasAnteriores) {
        serviciosAcumulados += r.duracion >= 120 ? 2 : 1;
        if (r._id.toString() === reserva._id.toString()) break;
      }
      if (serviciosAcumulados > sus.serviciosTotales) ingresoReservas += precio;
    }

    const suscripcionesMes = await suscripcionModel.countDocuments({
      empresa: empresaId,
      fechaInicio: { $gte: inicioMes, $lte: finMes },
    });
    const ingresoSuscripciones = suscripcionesMes * PRECIO_SUSCRIPCION;

    const reservasFuturas = await reservaModel
      .find({
        empresa: empresaId,
        fecha: { $gt: hoy, $lte: finMes },
        estado: { $nin: ["cancelada", "no_asistio"] },
      })
      .populate("servicio", "precio");

    let posibleIngreso = 0;
    for (const reserva of reservasFuturas) {
      const precio = reserva.precio || reserva.servicio?.precio || 0;
      const sus = await suscripcionModel.findOne({
        usuario: reserva.cliente,
        empresa: empresaId,
        fechaInicio: { $lte: reserva.fecha },
        fechaFin: { $gte: reserva.fecha },
      });

      if (!sus) {
        posibleIngreso += precio;
        continue;
      }

      const reservasAnteriores = await reservaModel
        .find({
          empresa: empresaId,
          cliente: reserva.cliente,
          fecha: { $gte: sus.fechaInicio, $lte: reserva.fecha },
          estado: { $nin: ["cancelada", "no_asistio"] },
        })
        .sort({ fecha: 1 });

      let serviciosAcumulados = 0;
      for (const r of reservasAnteriores) {
        serviciosAcumulados += r.duracion >= 120 ? 2 : 1;
        if (r._id.toString() === reserva._id.toString()) break;
      }
      if (serviciosAcumulados > sus.serviciosTotales) posibleIngreso += precio;
    }

    return res.json({
      ok: true,
      data: {
        ingresoTotal: ingresoReservas + ingresoSuscripciones,
        detalle: {
          ingresoReservas,
          ingresoSuscripciones,
          suscripcionesNuevas: suscripcionesMes,
          posibleIngreso:
            ingresoReservas + ingresoSuscripciones + posibleIngreso,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error ingresoMensual:", error);
    return err(res, "Error al obtener ingreso mensual");
  }
};

/* =====================================================
   INGRESO TOTAL
===================================================== */
export const ingresoTotal = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;

    const resultado = await reservaModel.aggregate([
      {
        $match: {
          estado: "completada",
          empresa: new mongoose.Types.ObjectId(empresaId),
        },
      },
      {
        $lookup: {
          from: "servicios",
          localField: "servicio",
          foreignField: "_id",
          as: "servicioData",
        },
      },
      { $unwind: "$servicioData" },
      { $group: { _id: null, total: { $sum: "$servicioData.precio" } } },
    ]);

    const total = resultado[0]?.total || 0;
    return ok(res, { total });
  } catch (error) {
    console.error(error);
    return err(res, "Error al calcular el ingreso total");
  }
};

/* =====================================================
   RESERVAS COMPLETADAS
===================================================== */
export const reservasCompletadas = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const total = await reservaModel.countDocuments({
      estado: "completada",
      empresa: new mongoose.Types.ObjectId(empresaId),
    });
    return ok(res, { total });
  } catch (error) {
    console.error(error);
    return err(res, "Error al contar reservas completadas");
  }
};

/* =====================================================
   RESERVAS CANCELADAS
===================================================== */
export const reservasCanceladas = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const total = await reservaModel.countDocuments({
      estado: "cancelada",
      empresa: new mongoose.Types.ObjectId(empresaId),
    });
    return ok(res, { total });
  } catch (error) {
    console.error(error);
    return err(res, "Error al contar reservas canceladas");
  }
};

/* =====================================================
   RESERVAS NO ASISTIDAS
===================================================== */
export const reservasNoAsistidas = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const total = await reservaModel.countDocuments({
      estado: "no_asistio",
      empresa: new mongoose.Types.ObjectId(empresaId),
    });
    return ok(res, { total });
  } catch (error) {
    console.error(error);
    return err(res, "Error al contar reservas no asistidas");
  }
};

/* =====================================================
   HORA MÁS CANCELADA
===================================================== */
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
          _id: { $hour: { date: "$fecha", timezone: "America/Santiago" } },
          total: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 1 },
    ]);

    if (!resultado.length) return ok(res, { total: null });

    const hora = resultado[0]._id;
    return ok(res, {
      total: `${hora}:00 - ${hora + 1}:00`,
      cantidad: resultado[0].total,
    });
  } catch (error) {
    console.error(error);
    return err(res, "Error al obtener la hora más cancelada");
  }
};

/* =====================================================
   SERVICIO MÁS POPULAR
===================================================== */
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
      { $group: { _id: "$servicio", total: { $sum: 1 } } },
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

    if (!resultado.length) return ok(res, { total: null });
    return ok(res, { total: resultado[0] });
  } catch (error) {
    console.error(error);
    return err(res, "Error al obtener servicio más popular");
  }
};

/* =====================================================
   TASA DE CANCELACIÓN
===================================================== */
export const tasaDeCancelacion = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;

    const [total, canceladas] = await Promise.all([
      reservaModel.countDocuments({
        empresa: new mongoose.Types.ObjectId(empresaId),
        estado: { $in: ["completada", "cancelada", "no_asistio"] },
      }),
      reservaModel.countDocuments({
        empresa: new mongoose.Types.ObjectId(empresaId),
        estado: "cancelada",
      }),
    ]);

    const tasa = total === 0 ? 0 : ((canceladas / total) * 100).toFixed(2);
    return ok(res, { total: `${tasa}%`, canceladas, totalReservas: total });
  } catch (error) {
    console.error(error);
    return err(res, "Error al calcular tasa de cancelación");
  }
};

/* =====================================================
   TASA DE ASISTENCIA
===================================================== */
export const tasaDeAsistencia = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const ahora = new Date();

    const [total, completadas, noAsistio] = await Promise.all([
      reservaModel.countDocuments({
        empresa: new mongoose.Types.ObjectId(empresaId),
        fecha: { $lt: ahora },
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
    return ok(res, {
      total: `${tasa}%`,
      completadas,
      noAsistio,
      totalReservas: total,
    });
  } catch (error) {
    console.error(error);
    return err(res, "Error al calcular tasa de asistencia");
  }
};

/* =====================================================
   TOP 5 CLIENTES (sin cambios funcionales)
===================================================== */
export const getTop5ClientesAsistentes = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;

    const topClientes = await reservaModel.aggregate([
      {
        $match: {
          empresa: new mongoose.Types.ObjectId(empresaId),
          estado: "completada", // ✅
        },
      },
      {
        $lookup: {
          from: "usuarios",
          localField: "cliente",
          foreignField: "_id",
          as: "clienteInfo",
        },
      },
      { $unwind: "$clienteInfo" },
      { $match: { "clienteInfo.rol": "cliente" } },
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
          _id: "$cliente",
          totalReservas: { $sum: 1 },
          totalGastado: { $sum: "$servicioInfo.precio" }, // ✅ precio del servicio
          nombre: { $first: "$clienteInfo.nombre" },
          apellido: { $first: "$clienteInfo.apellido" },
          email: { $first: "$clienteInfo.email" },
        },
      },
      { $sort: { totalGastado: -1 } },
      { $limit: 5 },
    ]);

    const formatter = new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    });

    return ok(
      res,
      topClientes.map((c) => ({
        nombre: c.nombre,
        apellido: c.apellido,
        totalReservas: c.totalReservas,
        totalGastado: c.totalGastado,
        totalGastadoFormateado: formatter.format(c.totalGastado),
      })),
    );
  } catch (error) {
    console.error(error);
    return err(res, "Error al obtener top clientes");
  }
};

export const getTop5ClientesCanceladores = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;

    const topCanceladores = await reservaModel.aggregate([
      {
        $match: {
          empresa: new mongoose.Types.ObjectId(empresaId),
          estado: "cancelada", // ✅ solo canceladas
        },
      },
      {
        $lookup: {
          from: "usuarios",
          localField: "cliente",
          foreignField: "_id",
          as: "clienteInfo",
        },
      },
      { $unwind: "$clienteInfo" },
      { $match: { "clienteInfo.rol": "cliente" } },
      {
        $group: {
          _id: "$cliente",
          totalCancelaciones: { $sum: 1 },
          nombre: { $first: "$clienteInfo.nombre" },
          apellido: { $first: "$clienteInfo.apellido" },
          email: { $first: "$clienteInfo.email" },
        },
      },
      { $sort: { totalCancelaciones: -1 } },
      { $limit: 5 },
    ]);

    return ok(
      res,
      topCanceladores.map((c) => ({
        nombre: c.nombre,
        apellido: c.apellido,
        email: c.email,
        totalCancelaciones: c.totalCancelaciones,
      })),
    );
  } catch (error) {
    console.error(error);
    return err(res, "Error al obtener top clientes canceladores");
  }
};

export const getTop5ClientesNoAsistidos = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;

    const topNoAsistidos = await reservaModel.aggregate([
      {
        $match: {
          empresa: new mongoose.Types.ObjectId(empresaId),
          estado: "no_asistio", // ✅
        },
      },
      {
        $lookup: {
          from: "usuarios",
          localField: "cliente",
          foreignField: "_id",
          as: "clienteInfo",
        },
      },
      { $unwind: "$clienteInfo" },
      { $match: { "clienteInfo.rol": "cliente" } },
      {
        $group: {
          _id: "$cliente",
          totalNoAsistidos: { $sum: 1 },
          nombre: { $first: "$clienteInfo.nombre" },
          apellido: { $first: "$clienteInfo.apellido" },
          email: { $first: "$clienteInfo.email" },
        },
      },
      { $sort: { totalNoAsistidos: -1 } },
      { $limit: 5 },
    ]);

    return ok(
      res,
      topNoAsistidos.map((c) => ({
        nombre: c.nombre,
        apellido: c.apellido,
        email: c.email,
        totalNoAsistidos: c.totalNoAsistidos,
      })),
    );
  } catch (error) {
    console.error(error);
    return err(res, "Error al obtener top clientes no asistidos");
  }
};
/* =====================================================
   HORA MÁS SOLICITADA
===================================================== */
export const getHoraMasSolicitada = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;

    const resultado = await reservaModel.aggregate([
      { $match: { empresa: new mongoose.Types.ObjectId(empresaId) } },
      {
        $addFields: {
          hora: { $hour: { date: "$fecha", timezone: "America/Santiago" } },
        },
      },
      { $group: { _id: "$hora", total: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 1 },
    ]);

    if (!resultado.length) return ok(res, { total: null });

    const hora = resultado[0]._id;
    return ok(res, {
      total: `${hora}:00 - ${hora + 1}:00`,
      totalReservas: resultado[0].total,
    });
  } catch (error) {
    console.error(error);
    return err(res, "Error al obtener hora más solicitada");
  }
};
