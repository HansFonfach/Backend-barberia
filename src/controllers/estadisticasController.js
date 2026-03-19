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

export const getDashboardResumen = async (req, res) => {
  try {
    const empresaId = new mongoose.Types.ObjectId(req.usuario.empresaId);
    const ahora = new Date();
    const PRECIO_SUSCRIPCION = 25000;
 
    // ── Rangos de fecha ──────────────────────────────
    const inicioHoy = new Date(ahora);
    inicioHoy.setHours(0, 0, 0, 0);
    const finHoy = new Date(ahora);
    finHoy.setHours(23, 59, 59, 999);
 
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    inicioMes.setHours(0, 0, 0, 0);
    const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0);
    finMes.setHours(23, 59, 59, 999);
 
    // ── Queries en paralelo ──────────────────────────
    const [
      reservasHoy,
      totalClientes,
      citasMes,
      totalCompletadas,
      totalCanceladas,
      totalNoAsistio,
      totalParaTasa,
      horaMasCancelada,
      horaMasSolicitada,
      servicioMasPopular,
      topAsistentes,
      topCanceladores,
      topNoAsistidos,
      ingresoTotalAggregate,
      reservasPasadasMes,
      reservasFuturasMes,
      suscripcionesMes,
    ] = await Promise.all([
      // 1. Reservas hoy
      reservaModel.countDocuments({
        empresa: empresaId,
        fecha: { $gte: inicioHoy, $lte: finHoy },
        estado: { $ne: "cancelada" },
      }),
 
      // 2. Total clientes
      usuarioModel.countDocuments({
        empresa: empresaId,
        rol: "cliente",
        estado: "activo",
      }),
 
      // 3. Citas este mes
      reservaModel.countDocuments({
        empresa: empresaId,
        fecha: { $gte: inicioMes, $lt: finMes },
        estado: { $ne: "cancelada" },
      }),
 
      // 4. Completadas
      reservaModel.countDocuments({ empresa: empresaId, estado: "completada" }),
 
      // 5. Canceladas
      reservaModel.countDocuments({ empresa: empresaId, estado: "cancelada" }),
 
      // 6. No asistió
      reservaModel.countDocuments({ empresa: empresaId, estado: "no_asistio" }),
 
      // 7. Total para tasas
      reservaModel.countDocuments({
        empresa: empresaId,
        estado: { $in: ["completada", "cancelada", "no_asistio"] },
      }),
 
      // 8. Hora más cancelada
      reservaModel.aggregate([
        { $match: { empresa: empresaId, estado: "cancelada" } },
        {
          $group: {
            _id: { $hour: { date: "$fecha", timezone: "America/Santiago" } },
            total: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
        { $limit: 1 },
      ]),
 
      // 9. Hora más solicitada
      reservaModel.aggregate([
        { $match: { empresa: empresaId } },
        {
          $addFields: {
            hora: { $hour: { date: "$fecha", timezone: "America/Santiago" } },
          },
        },
        { $group: { _id: "$hora", total: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 1 },
      ]),
 
      // 10. Servicio más popular
      reservaModel.aggregate([
        {
          $match: {
            empresa: empresaId,
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
      ]),
 
      // 11. Top 5 asistentes
      reservaModel.aggregate([
        { $match: { empresa: empresaId, estado: "completada" } },
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
            totalGastado: { $sum: "$servicioInfo.precio" },
            nombre: { $first: "$clienteInfo.nombre" },
            apellido: { $first: "$clienteInfo.apellido" },
          },
        },
        { $sort: { totalGastado: -1 } },
        { $limit: 5 },
      ]),
 
      // 12. Top 5 canceladores
      reservaModel.aggregate([
        { $match: { empresa: empresaId, estado: "cancelada" } },
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
      ]),
 
      // 13. Top 5 no asistidos
      reservaModel.aggregate([
        { $match: { empresa: empresaId, estado: "no_asistio" } },
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
      ]),
 
      // 14. Ingreso total histórico
      reservaModel.aggregate([
        { $match: { empresa: empresaId, estado: "completada" } },
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
      ]),
 
      // 15. Reservas pasadas del mes (para ingreso mensual)
      reservaModel
        .find({
          empresa: empresaId,
          fecha: { $gte: inicioMes, $lte: ahora },
          estado: { $nin: ["cancelada", "no_asistio"] },
        })
        .populate("servicio", "precio")
        .lean(),
 
      // 16. Reservas futuras del mes (para posible ingreso)
      reservaModel
        .find({
          empresa: empresaId,
          fecha: { $gt: ahora, $lte: finMes },
          estado: { $nin: ["cancelada", "no_asistio"] },
        })
        .populate("servicio", "precio")
        .lean(),
 
      // 17. Suscripciones nuevas del mes
      suscripcionModel.countDocuments({
        empresa: empresaId,
        fechaInicio: { $gte: inicioMes, $lte: finMes },
      }),
    ]);
 
    // ── Calcular ingreso mensual (fix N+1) ───────────
    const calcularIngresoConSus = async (reservas) => {
      if (!reservas.length) return 0;
 
      // Una sola query para todas las suscripciones relevantes
      const clienteIds = [...new Set(reservas.map((r) => r.cliente?.toString()))];
      const todasLasSus = await suscripcionModel
        .find({ usuario: { $in: clienteIds }, empresa: empresaId })
        .lean();
 
      // Map clienteId → suscripciones[]
      const susMap = new Map();
      for (const s of todasLasSus) {
        const key = s.usuario.toString();
        if (!susMap.has(key)) susMap.set(key, []);
        susMap.get(key).push(s);
      }
 
      // Todas las reservas del mes de estos clientes (para contar servicios acumulados)
      const todasReservasMes = await reservaModel
        .find({
          empresa: empresaId,
          cliente: { $in: clienteIds },
          fecha: { $gte: inicioMes, $lte: finMes },
          estado: { $nin: ["cancelada", "no_asistio"] },
        })
        .sort({ fecha: 1 })
        .lean();
 
      // Map clienteId → reservas ordenadas
      const reservasPorCliente = new Map();
      for (const r of todasReservasMes) {
        const key = r.cliente.toString();
        if (!reservasPorCliente.has(key)) reservasPorCliente.set(key, []);
        reservasPorCliente.get(key).push(r);
      }
 
      let ingreso = 0;
      for (const reserva of reservas) {
        const precio = reserva.precio || reserva.servicio?.precio || 0;
        const clienteKey = reserva.cliente?.toString();
        const suscripciones = susMap.get(clienteKey) || [];
 
        const sus = suscripciones.find(
          (s) =>
            new Date(s.fechaInicio) <= new Date(reserva.fecha) &&
            new Date(s.fechaFin) >= new Date(reserva.fecha),
        );
 
        if (!sus) {
          ingreso += precio;
          continue;
        }
 
        const reservasCliente = reservasPorCliente.get(clienteKey) || [];
        let serviciosAcumulados = 0;
        for (const r of reservasCliente) {
          serviciosAcumulados += r.duracion >= 120 ? 2 : 1;
          if (r._id.toString() === reserva._id.toString()) break;
        }
 
        if (serviciosAcumulados > sus.serviciosTotales) ingreso += precio;
      }
 
      return ingreso;
    };
 
    const [ingresoReservas, posibleIngreso] = await Promise.all([
      calcularIngresoConSus(reservasPasadasMes),
      calcularIngresoConSus(reservasFuturasMes),
    ]);
 
    const ingresoSuscripciones = suscripcionesMes * PRECIO_SUSCRIPCION;
    const ingresoTotalHistorico = ingresoTotalAggregate[0]?.total || 0;
 
    // ── Formatear tasas ──────────────────────────────
    const tasaCancelacion =
      totalParaTasa === 0
        ? "0%"
        : `${((totalCanceladas / totalParaTasa) * 100).toFixed(2)}%`;
 
    const tasaAsistencia =
      totalParaTasa === 0
        ? "0%"
        : `${((totalCompletadas / totalParaTasa) * 100).toFixed(2)}%`;
 
    // ── Formatear hora más cancelada/solicitada ──────
    const horaCancelada = horaMasCancelada[0]
      ? {
          rango: `${horaMasCancelada[0]._id}:00 - ${horaMasCancelada[0]._id + 1}:00`,
          cantidad: horaMasCancelada[0].total,
        }
      : null;
 
    const horaSolicitada = horaMasSolicitada[0]
      ? {
          rango: `${horaMasSolicitada[0]._id}:00 - ${horaMasSolicitada[0]._id + 1}:00`,
          totalReservas: horaMasSolicitada[0].total,
        }
      : null;
 
    // ── Formatear top clientes ───────────────────────
    const formatter = new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    });
 
    return ok(res, {
      // Conteos generales
      reservasHoy,
      totalClientes,
      citasMes,
 
      // Reservas por estado
      reservasCompletadas: totalCompletadas,
      reservasCanceladas: totalCanceladas,
      reservasNoAsistidas: totalNoAsistio,
 
      // Tasas
      tasaCancelacion: {
        porcentaje: tasaCancelacion,
        canceladas: totalCanceladas,
        totalReservas: totalParaTasa,
      },
      tasaAsistencia: {
        porcentaje: tasaAsistencia,
        completadas: totalCompletadas,
        noAsistio: totalNoAsistio,
        totalReservas: totalParaTasa,
      },
 
      // Horas
      horaMasCancelada: horaCancelada,
      horaMasSolicitada: horaSolicitada,
 
      // Servicio popular
      servicioMasPopular: servicioMasPopular[0] || null,
 
      // Ingresos
      ingresoTotal: ingresoTotalHistorico,
      ingresoMensual: {
        ingresoTotal: ingresoReservas + ingresoSuscripciones,
        detalle: {
          ingresoReservas,
          ingresoSuscripciones,
          suscripcionesNuevas: suscripcionesMes,
          posibleIngreso: ingresoReservas + ingresoSuscripciones + posibleIngreso,
        },
      },
 
      // Top clientes
      topAsistentes: topAsistentes.map((c) => ({
        nombre: c.nombre,
        apellido: c.apellido,
        totalReservas: c.totalReservas,
        totalGastado: c.totalGastado,
        totalGastadoFormateado: formatter.format(c.totalGastado),
      })),
      topCanceladores: topCanceladores.map((c) => ({
        nombre: c.nombre,
        apellido: c.apellido,
        email: c.email,
        totalCancelaciones: c.totalCancelaciones,
      })),
      topNoAsistidos: topNoAsistidos.map((c) => ({
        nombre: c.nombre,
        apellido: c.apellido,
        email: c.email,
        totalNoAsistidos: c.totalNoAsistidos,
      })),
    });
  } catch (error) {
    console.error("❌ Error getDashboardResumen:", error);
    return err(res, "Error al obtener resumen del dashboard");
  }
};
