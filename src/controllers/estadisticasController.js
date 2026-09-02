import reservaModel from "../models/reserva.model.js";
import usuarioModel from "../models/usuario.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import suscripcionModel from "../models/suscripcion.model.js";
import mongoose from "mongoose";
import productoModel from "../models/producto.Model.js";
import ventaDirectaModel from "../models/ventaDirecta.model.js";

dayjs.extend(utc);
dayjs.extend(timezone);

/* =====================================================
   CONSTANTES
===================================================== */
const PRECIO_SUSCRIPCION = 25000;
const ZONA = "America/Santiago";

// Filtro de "estado" para reservas que sí cuentan como ingreso/atención
// realizada: se excluyen "cancelada" y "no_asistio" (obvio), pero también
// "reagendada" — una reserva reagendada es la reserva VIEJA que quedó
// reemplazada por una nueva (ver reagendamiento en reservaController.js):
// el servicio nunca se prestó en esa fecha/hora original, se movió a otra.
// Sin excluirla, se contaba como ingreso la cita vieja Y la nueva a la vez
// (doble conteo) cada vez que un cliente reagendaba.
const ESTADOS_VALIDOS = { $nin: ["cancelada", "no_asistio", "reagendada"] };

/**
 * ⚠️ REVISAR: nombre del campo que guarda al profesional en
 * ventaDirecta.model.js. Si en tu schema se llama distinto
 * (vendedor, usuario, atendidoPor), cámbialo acá y listo.
 * Si el campo no existe, los barberos no admin verán $0 en
 * ventas directas (falla hacia el lado seguro, no hacia el lado
 * de mostrar plata que no les corresponde).
 */
const CAMPO_BARBERO_VENTA = "barbero";

/* =====================================================
   UTIL
===================================================== */
const ok = (res, data) => res.json({ ok: true, data });
const err = (res, msg, status = 500) =>
  res.status(status).json({ ok: false, message: msg });

const toId = (valor) => new mongoose.Types.ObjectId(String(valor));

/**
 * ⚠️ REQUISITO: el middleware de auth tiene que dejar esAdmin
 * dentro de req.usuario. Si no viene, todos quedan como NO admin
 * y solo ven lo suyo.
 */
const esAdmin = (req) => req.usuario?.esAdmin === true;

/** Etiqueta que el front puede usar para el título de la tarjeta */
const alcanceDe = (req) => (esAdmin(req) ? "empresa" : "personal");

/**
 * Filtro de reservas: vacío para admin (ve toda la empresa),
 * acotado al profesional para el resto.
 */
const filtroBarbero = (req) =>
  esAdmin(req) ? {} : { barbero: toId(req.usuario.id) };

/** Lo mismo para ventas directas */
const filtroVentaBarbero = (req) =>
  esAdmin(req) ? {} : { [CAMPO_BARBERO_VENTA]: toId(req.usuario.id) };

const rangoDia = (fecha = new Date()) => {
  const inicio = new Date(fecha);
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date(fecha);
  fin.setHours(23, 59, 59, 999);
  return { inicio, fin };
};

const rangoMes = (anio, mes) => {
  const inicio = new Date(anio, mes, 1);
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date(anio, mes + 1, 0);
  fin.setHours(23, 59, 59, 999);
  return { inicio, fin };
};

const agruparPor = (lista, obtenerClave) => {
  const mapa = new Map();
  for (const item of lista) {
    const clave = obtenerClave(item);
    if (!clave) continue;
    if (!mapa.has(clave)) mapa.set(clave, []);
    mapa.get(clave).push(item);
  }
  return mapa;
};

const formatearRangoHora = (hora) => `${hora}:00 - ${hora + 1}:00`;

/** Suma totalFinal de ventas directas en una sola pasada de Mongo */
const sumarVentasDirectas = async (match) => {
  const [resultado] = await ventaDirectaModel.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: "$totalFinal" } } },
  ]);
  return resultado?.total || 0;
};

/* =====================================================
   CÁLCULO DE INGRESO POR RESERVAS

   Una reserva NO genera ingreso si el cliente tenía una
   suscripción vigente y todavía no agota los servicios
   incluidos en ella.

   Antes esto se hacía con dos queries dentro del for
   (una por reserva). Con 300 reservas en el mes eran 600
   consultas y por eso el front se quedaba pegado.
   Ahora son 2 queries en total, sin importar el volumen.

   Ojo: el conteo de servicios acumulados mira TODAS las
   reservas del cliente en la empresa, no solo las del
   barbero. La suscripción es del cliente, no del profesional.
===================================================== */
const calcularIngresoConSuscripciones = async (reservas, empresaId) => {
  if (!reservas.length) return 0;

  const clienteIds = [
    ...new Set(reservas.map((r) => r.cliente?.toString()).filter(Boolean)),
  ];

  const suscripciones = await suscripcionModel
    .find({ usuario: { $in: clienteIds }, empresa: empresaId })
    .lean();

  // Sin suscripciones vigentes: todo suma y nos ahorramos la segunda query
  if (!suscripciones.length) {
    return reservas.reduce(
      (acc, r) => acc + (r.precio || r.servicio?.precio || 0),
      0,
    );
  }

  const susPorCliente = agruparPor(suscripciones, (s) => s.usuario.toString());

  const desde = new Date(
    Math.min(...suscripciones.map((s) => new Date(s.fechaInicio).getTime())),
  );
  const hasta = new Date(
    Math.max(...reservas.map((r) => new Date(r.fecha).getTime())),
  );

  const historial = await reservaModel
    .find({
      empresa: empresaId,
      cliente: { $in: clienteIds },
      fecha: { $gte: desde, $lte: hasta },
      estado: ESTADOS_VALIDOS,
    })
    .select("cliente fecha duracion")
    .sort({ fecha: 1 })
    .lean();

  const historialPorCliente = agruparPor(historial, (r) =>
    r.cliente.toString(),
  );

  let ingreso = 0;

  for (const reserva of reservas) {
    const precio = reserva.precio || reserva.servicio?.precio || 0;
    const clave = reserva.cliente?.toString();

    const sus = (susPorCliente.get(clave) || []).find(
      (s) =>
        new Date(s.fechaInicio) <= new Date(reserva.fecha) &&
        new Date(s.fechaFin) >= new Date(reserva.fecha),
    );

    if (!sus) {
      ingreso += precio;
      continue;
    }

    let serviciosAcumulados = 0;
    for (const r of historialPorCliente.get(clave) || []) {
      if (new Date(r.fecha) >= new Date(sus.fechaInicio)) {
        serviciosAcumulados += r.duracion >= 120 ? 2 : 1;
      }
      if (r._id.toString() === reserva._id.toString()) break;
    }

    if (serviciosAcumulados > sus.serviciosTotales) ingreso += precio;
  }

  return ingreso;
};

/* =====================================================
   RESERVAS HOY (BARBERO)
===================================================== */
export const totalReservasHoyBarbero = async (req, res) => {
  try {
    const userId = req.usuario.id;
    const { inicio, fin } = rangoDia();

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
   (dato de la empresa, no se reparte por profesional)
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
    const ahoraChile = dayjs().tz(ZONA).toDate();

    const reserva = await reservaModel
      .findOne({ cliente: userId, fecha: { $lt: ahoraChile } })
      .sort({ fecha: -1 })
      .select("fecha")
      .lean();

    if (!reserva) return err(res, "No se encontraron reservas pasadas", 404);

    const fechaChile = new Date(reserva.fecha).toLocaleString("es-CL", {
      timeZone: ZONA,
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
    return err(res, "Error obteniendo última reserva");
  }
};

/* =====================================================
   PRÓXIMA RESERVA (CLIENTE)
===================================================== */
export const proximaReserva = async (req, res) => {
  try {
    const clienteId = req.usuario.id;
    const ahoraChile = dayjs().tz(ZONA).toDate();

    const reserva = await reservaModel
      .findOne({
        cliente: clienteId,
        fecha: { $gt: ahoraChile },
        estado: "pendiente",
      })
      .sort({ fecha: 1 })
      .select("fecha")
      .lean();

    if (!reserva) return err(res, "Aún no tienes reservas futuras", 404);

    const fechaChile = new Date(reserva.fecha).toLocaleString("es-CL", {
      timeZone: ZONA,
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

    const fechaChile = dayjs(reserva.fecha).tz(ZONA);

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

   Admin  → ingreso de toda la empresa (incluye suscripciones)
   Barbero → solo sus reservas y sus ventas directas
===================================================== */
export const ingresoMensual = async (req, res) => {
  try {
    const empresaIdRaw = req.usuario?.empresaId;
    if (!empresaIdRaw) return err(res, "Empresa no identificada", 400);

    const empresaId = toId(empresaIdRaw);
    const admin = esAdmin(req);
    const filtro = filtroBarbero(req);
    const filtroVenta = filtroVentaBarbero(req);

    const hoy = new Date();
    const { inicio: inicioMes, fin: finMes } = rangoMes(
      hoy.getFullYear(),
      hoy.getMonth(),
    );

    const [
      reservasPasadas,
      reservasFuturas,
      suscripcionesMes,
      ingresoVentasDirectas,
    ] = await Promise.all([
      reservaModel
        .find({
          empresa: empresaId,
          ...filtro,
          fecha: { $gte: inicioMes, $lte: hoy },
          estado: ESTADOS_VALIDOS,
        })
        .populate("servicio", "precio")
        .lean(),

      reservaModel
        .find({
          empresa: empresaId,
          ...filtro,
          fecha: { $gt: hoy, $lte: finMes },
          estado: ESTADOS_VALIDOS,
        })
        .populate("servicio", "precio")
        .lean(),

      // Las suscripciones son ingreso del negocio, no de un profesional
      admin
        ? suscripcionModel.countDocuments({
            empresa: empresaId,
            fechaInicio: { $gte: inicioMes, $lte: finMes },
          })
        : 0,

      sumarVentasDirectas({
        empresa: empresaId,
        ...filtroVenta,
        fecha: { $gte: inicioMes, $lte: finMes },
        anulada: false,
      }),
    ]);

    const [ingresoReservas, posibleIngreso] = await Promise.all([
      calcularIngresoConSuscripciones(reservasPasadas, empresaId),
      calcularIngresoConSuscripciones(reservasFuturas, empresaId),
    ]);

    const ingresoSuscripciones = suscripcionesMes * PRECIO_SUSCRIPCION;

    const ingresoProductosReservas = reservasPasadas.reduce(
      (acc, r) => acc + (r.totalProductos || 0),
      0,
    );
    const ingresoProductos = ingresoProductosReservas + ingresoVentasDirectas;

    const ingresoExtras = reservasPasadas.reduce(
      (acc, r) => acc + (r.totalExtras || 0),
      0,
    );

    const ingresoTotalMes =
      ingresoReservas + ingresoSuscripciones + ingresoProductos + ingresoExtras;

    return ok(res, {
      alcance: alcanceDe(req),
      esAdmin: admin,
      ingresoTotal: ingresoTotalMes,
      detalle: {
        ingresoReservas,
        ingresoProductos,
        ingresoExtras,
        ingresoSuscripciones,
        suscripcionesNuevas: suscripcionesMes,
        posibleIngreso: ingresoTotalMes + posibleIngreso,
      },
    });
  } catch (error) {
    console.error("❌ Error ingresoMensual:", error);
    return err(res, "Error al obtener ingreso mensual");
  }
};

/* =====================================================
   INGRESO TOTAL (HISTÓRICO)

   Admin  → todo el histórico de la empresa
   Barbero → solo lo suyo
===================================================== */
export const ingresoTotal = async (req, res) => {
  try {
    const empresaId = toId(req.usuario.empresaId);
    const admin = esAdmin(req);
    const filtro = filtroBarbero(req);
    const filtroVenta = filtroVentaBarbero(req);

    const [serviciosAgg, totalesAgg, ingresoVentasDirectas, suscripciones] =
      await Promise.all([
        // Servicios de reservas completadas
        reservaModel.aggregate([
          { $match: { empresa: empresaId, ...filtro, estado: "completada" } },
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

        // Productos y extras: antes se traían TODAS las reservas a memoria
        // solo para sumarlas. Ahora lo hace Mongo en una pasada.
        reservaModel.aggregate([
          { $match: { empresa: empresaId, ...filtro } },
          {
            $group: {
              _id: null,
              productos: { $sum: "$totalProductos" },
              extras: { $sum: "$totalExtras" },
            },
          },
        ]),

        sumarVentasDirectas({
          empresa: empresaId,
          ...filtroVenta,
          anulada: false,
        }),

        admin ? suscripcionModel.countDocuments({ empresa: empresaId }) : 0,
      ]);

    const ingresoServicios = serviciosAgg[0]?.total || 0;
    const ingresoProductos = totalesAgg[0]?.productos || 0;
    const ingresoExtras = totalesAgg[0]?.extras || 0;
    const ingresoSuscripciones = suscripciones * PRECIO_SUSCRIPCION;

    return ok(res, {
      alcance: alcanceDe(req),
      esAdmin: admin,
      total:
        ingresoServicios +
        ingresoProductos +
        ingresoExtras +
        ingresoVentasDirectas +
        ingresoSuscripciones,
      detalle: {
        ingresoServicios,
        ingresoProductos,
        ingresoExtras,
        ingresoVentasDirectas,
        ingresoSuscripciones,
      },
    });
  } catch (error) {
    console.error(error);
    return err(res, "Error al calcular el ingreso total");
  }
};

/* =====================================================
   HORA MÁS SOLICITADA
===================================================== */
export const getHoraMasSolicitada = async (req, res) => {
  try {
    const empresaId = toId(req.usuario.empresaId);
    const filtro = filtroBarbero(req);

    const resultado = await reservaModel.aggregate([
      { $match: { empresa: empresaId, ...filtro } },
      {
        $group: {
          _id: { $hour: { date: "$fecha", timezone: ZONA } },
          total: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 1 },
    ]);

    if (!resultado.length) return ok(res, { total: null });

    return ok(res, {
      total: formatearRangoHora(resultado[0]._id),
      totalReservas: resultado[0].total,
      alcance: alcanceDe(req),
    });
  } catch (error) {
    console.error(error);
    return err(res, "Error al obtener hora más solicitada");
  }
};

/* =====================================================
   RESUMEN DASHBOARD

   Todo lo que sale de reservas queda acotado al profesional
   cuando no es admin. Lo que no se puede atribuir a nadie
   (suscripciones) solo lo ve el admin.
===================================================== */
export const getDashboardResumen = async (req, res) => {
  try {
    const empresaId = toId(req.usuario.empresaId);
    const admin = esAdmin(req);
    const filtro = filtroBarbero(req);
    const filtroVenta = filtroVentaBarbero(req);

    const ahora = new Date();
    const { inicio: inicioHoy, fin: finHoy } = rangoDia(ahora);
    const { inicio: inicioMes, fin: finMes } = rangoMes(
      ahora.getFullYear(),
      ahora.getMonth(),
    );

    const base = { empresa: empresaId, ...filtro };

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
      ventasDirectasMes,
    ] = await Promise.all([
      // 1. Reservas hoy
      reservaModel.countDocuments({
        ...base,
        fecha: { $gte: inicioHoy, $lte: finHoy },
        estado: { $ne: "cancelada" },
      }),

      // 2. Clientes: el admin ve la cartera completa,
      //    el barbero cuenta los clientes que ha atendido
      admin
        ? usuarioModel.countDocuments({
            empresa: empresaId,
            rol: { $in: ["cliente", "invitado"] },
            estado: "activo",
          })
        : reservaModel
            .distinct("cliente", { ...base, estado: ESTADOS_VALIDOS })
            .then((lista) => lista.length),

      // 3. Citas este mes
      reservaModel.countDocuments({
        ...base,
        fecha: { $gte: inicioMes, $lt: finMes },
        estado: { $ne: "cancelada" },
      }),

      // 4. Completadas
      reservaModel.countDocuments({ ...base, estado: "completada" }),

      // 5. Canceladas
      reservaModel.countDocuments({ ...base, estado: "cancelada" }),

      // 6. No asistió
      reservaModel.countDocuments({ ...base, estado: "no_asistio" }),

      // 7. Total para tasas
      reservaModel.countDocuments({
        ...base,
        estado: { $in: ["completada", "cancelada", "no_asistio"] },
      }),

      // 8. Hora más cancelada
      reservaModel.aggregate([
        { $match: { ...base, estado: "cancelada" } },
        {
          $group: {
            _id: { $hour: { date: "$fecha", timezone: ZONA } },
            total: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
        { $limit: 1 },
      ]),

      // 9. Hora más solicitada
      reservaModel.aggregate([
        { $match: base },
        {
          $group: {
            _id: { $hour: { date: "$fecha", timezone: ZONA } },
            total: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
        { $limit: 1 },
      ]),

      // 10. Servicio más popular
      reservaModel.aggregate([
        {
          $match: {
            ...base,
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
        { $match: { ...base, estado: "completada" } },
        {
          $lookup: {
            from: "usuarios",
            localField: "cliente",
            foreignField: "_id",
            as: "clienteInfo",
          },
        },
        { $unwind: "$clienteInfo" },
        { $match: { "clienteInfo.rol": { $in: ["cliente", "invitado"] } } },
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
        { $match: { ...base, estado: "cancelada" } },
        {
          $lookup: {
            from: "usuarios",
            localField: "cliente",
            foreignField: "_id",
            as: "clienteInfo",
          },
        },
        { $unwind: "$clienteInfo" },
        { $match: { "clienteInfo.rol": { $in: ["cliente", "invitado"] } } },
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
        { $match: { ...base, estado: "no_asistio" } },
        {
          $lookup: {
            from: "usuarios",
            localField: "cliente",
            foreignField: "_id",
            as: "clienteInfo",
          },
        },
        { $unwind: "$clienteInfo" },
        { $match: { "clienteInfo.rol": { $in: ["cliente", "invitado"] } } },
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

      // 14. Ingreso histórico
      reservaModel.aggregate([
        { $match: { ...base, estado: "completada" } },
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

      // 15. Reservas pasadas del mes
      reservaModel
        .find({
          ...base,
          fecha: { $gte: inicioMes, $lte: ahora },
          estado: ESTADOS_VALIDOS,
        })
        .populate("servicio", "precio")
        .lean(),

      // 16. Reservas futuras del mes
      reservaModel
        .find({
          ...base,
          fecha: { $gt: ahora, $lte: finMes },
          estado: ESTADOS_VALIDOS,
        })
        .populate("servicio", "precio")
        .lean(),

      // 17. Suscripciones nuevas del mes (solo admin)
      admin
        ? suscripcionModel.countDocuments({
            empresa: empresaId,
            fechaInicio: { $gte: inicioMes, $lte: finMes },
          })
        : 0,

      // 18. Ventas directas del mes
      sumarVentasDirectas({
        empresa: empresaId,
        ...filtroVenta,
        fecha: { $gte: inicioMes, $lte: finMes },
        anulada: false,
      }),
    ]);

    const [ingresoReservas, posibleIngreso] = await Promise.all([
      calcularIngresoConSuscripciones(reservasPasadasMes, empresaId),
      calcularIngresoConSuscripciones(reservasFuturasMes, empresaId),
    ]);

    const ingresoSuscripciones = suscripcionesMes * PRECIO_SUSCRIPCION;
    const ingresoTotalHistorico = ingresoTotalAggregate[0]?.total || 0;

    const ingresoProductosMes =
      reservasPasadasMes.reduce((acc, r) => acc + (r.totalProductos || 0), 0) +
      ventasDirectasMes;
    const ingresoExtrasMes = reservasPasadasMes.reduce(
      (acc, r) => acc + (r.totalExtras || 0),
      0,
    );

    const ingresoMesTotal =
      ingresoReservas +
      ingresoSuscripciones +
      ingresoProductosMes +
      ingresoExtrasMes;

    // ── Tasas ────────────────────────────────────────
    const porcentaje = (parte) =>
      totalParaTasa === 0
        ? "0%"
        : `${((parte / totalParaTasa) * 100).toFixed(2)}%`;

    // ── Horas ────────────────────────────────────────
    const horaCancelada = horaMasCancelada[0]
      ? {
          rango: formatearRangoHora(horaMasCancelada[0]._id),
          cantidad: horaMasCancelada[0].total,
        }
      : null;

    const horaSolicitada = horaMasSolicitada[0]
      ? {
          rango: formatearRangoHora(horaMasSolicitada[0]._id),
          totalReservas: horaMasSolicitada[0].total,
        }
      : null;

    const formatter = new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    });

    return ok(res, {
      // Contexto para que el front sepa qué está mostrando
      alcance: alcanceDe(req),
      esAdmin: admin,

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
        porcentaje: porcentaje(totalCanceladas),
        canceladas: totalCanceladas,
        totalReservas: totalParaTasa,
      },
      tasaAsistencia: {
        porcentaje: porcentaje(totalCompletadas),
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
        ingresoTotal: ingresoMesTotal,
        detalle: {
          ingresoReservas,
          ingresoProductos: ingresoProductosMes,
          ingresoExtras: ingresoExtrasMes,
          ingresoSuscripciones,
          suscripcionesNuevas: suscripcionesMes,
          posibleIngreso: ingresoMesTotal + posibleIngreso,
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

/* =====================================================
   INGRESOS POR MES
   GET /estadisticas/ingresos?mes=3&anio=2025   (mes 0-11)
===================================================== */
/* =====================================================
   1) PEGAR ESTA FUNCIÓN EN estadisticasController.js
      Justo debajo de calcularIngresoConSuscripciones.

      Va acá y no en helpers/ porque necesita cuatro cosas
      que ya viven en este archivo: calcularIngresoConSuscripciones,
      agruparPor, ventaDirectaModel y usuarioModel.

      No vuelve a consultar reservas: reutiliza las que el
      endpoint ya trajo. Por eso los números cuadran con el
      total de la pantalla en vez de ser un cálculo paralelo.
===================================================== */
const ingresosPorProfesional = async (reservas, empresaId, rangoFecha) => {
  const porBarbero = agruparPor(reservas, (r) => r.barbero?.toString());

  const ventasAgg = await ventaDirectaModel.aggregate([
    {
      $match: {
        empresa: empresaId,
        anulada: false,
        fecha: rangoFecha,
      },
    },
    {
      $group: {
        _id: `$${CAMPO_BARBERO_VENTA}`,
        total: { $sum: "$totalFinal" },
      },
    },
  ]);

  const ventasPorBarbero = new Map(
    ventasAgg.filter((v) => v._id).map((v) => [String(v._id), v.total]),
  );

  // Quien vendió productos pero no atendió a nadie también aparece
  for (const id of ventasPorBarbero.keys()) {
    if (!porBarbero.has(id)) porBarbero.set(id, []);
  }

  const ids = [...porBarbero.keys()];
  if (!ids.length) return [];

  const usuarios = await usuarioModel
    .find({ _id: { $in: ids } })
    .select("nombre apellido")
    .lean();

  const nombrePorId = new Map(
    usuarios.map((u) => [
      String(u._id),
      `${u.nombre || ""} ${u.apellido || ""}`.trim(),
    ]),
  );

  const resultado = await Promise.all(
    ids.map(async (id) => {
      const suyas = porBarbero.get(id);

      const ingresoReservas = await calcularIngresoConSuscripciones(
        suyas,
        empresaId,
      );

      const ingresoProductos =
        suyas.reduce((acc, r) => acc + (r.totalProductos || 0), 0) +
        (ventasPorBarbero.get(id) || 0);

      const ingresoExtras = suyas.reduce(
        (acc, r) => acc + (r.totalExtras || 0),
        0,
      );

      return {
        barberoId: id,
        nombre: nombrePorId.get(id) || "Sin nombre",
        ingresoReservas,
        ingresoProductos,
        ingresoExtras,
        cantidadReservas: suyas.length,
        total: ingresoReservas + ingresoProductos + ingresoExtras,
      };
    }),
  );

  return resultado.sort((a, b) => b.total - a.total);
};

/* =====================================================
   2) REEMPLAZAR ingresosPorMes COMPLETA POR ESTA
===================================================== */
export const ingresosPorMes = async (req, res) => {
  try {
    const empresaIdRaw = req.usuario?.empresaId;
    if (!empresaIdRaw) return err(res, "Empresa no identificada", 400);

    const empresaId = toId(empresaIdRaw);
    const admin = esAdmin(req);
    const filtro = filtroBarbero(req);
    const filtroVenta = filtroVentaBarbero(req);

    const mes = parseInt(req.query.mes);
    const anio = parseInt(req.query.anio);

    if (isNaN(mes) || isNaN(anio) || mes < 0 || mes > 11) {
      return err(res, "Debes enviar mes (0-11) y anio como query params", 400);
    }

    const ahora = new Date();
    const { inicio: inicioMes, fin: finMes } = rangoMes(anio, mes);

    // Mes actual: solo hasta ahora. Mes pasado: el mes completo.
    const esMesActual =
      anio === ahora.getFullYear() && mes === ahora.getMonth();
    const finConsulta = esMesActual ? ahora : finMes;

    const rangoVentas = { $gte: inicioMes, $lte: finConsulta };

    const [
      reservasPasadas,
      reservasFuturas,
      suscripcionesMes,
      ingresoVentasDirectas,
    ] = await Promise.all([
      reservaModel
        .find({
          empresa: empresaId,
          ...filtro,
          fecha: { $gte: inicioMes, $lte: finConsulta },
          estado: ESTADOS_VALIDOS,
        })
        .populate("servicio", "precio")
        .lean(),

      esMesActual
        ? reservaModel
            .find({
              empresa: empresaId,
              ...filtro,
              fecha: { $gt: ahora, $lte: finMes },
              estado: ESTADOS_VALIDOS,
            })
            .populate("servicio", "precio")
            .lean()
        : [],

      admin
        ? suscripcionModel.countDocuments({
            empresa: empresaId,
            fechaInicio: { $gte: inicioMes, $lte: finMes },
          })
        : 0,

      sumarVentasDirectas({
        empresa: empresaId,
        ...filtroVenta,
        fecha: rangoVentas,
        anulada: false,
      }),
    ]);

    const [ingresoReservas, posibleIngreso] = await Promise.all([
      calcularIngresoConSuscripciones(reservasPasadas, empresaId),
      // Las futuras también respetan la suscripción; antes se sumaban
      // completas y por eso el "posible ingreso" salía inflado.
      calcularIngresoConSuscripciones(reservasFuturas, empresaId),
    ]);

    const ingresoSuscripciones = suscripcionesMes * PRECIO_SUSCRIPCION;

    // Las ventas directas van dentro de productos, igual que en
    // ingresoMensual. Antes quedaban fuera del total y por eso esta
    // pantalla mostraba menos plata que el dashboard.
    const ingresoProductos =
      reservasPasadas.reduce((acc, r) => acc + (r.totalProductos || 0), 0) +
      ingresoVentasDirectas;

    const ingresoExtras = reservasPasadas.reduce(
      (acc, r) => acc + (r.totalExtras || 0),
      0,
    );

    const ingresoTotalMes =
      ingresoReservas + ingresoSuscripciones + ingresoProductos + ingresoExtras;

    // Solo el admin ve el desglose por persona. Acá está el control
    // de acceso real: al resto le llega un array vacío.
    const porProfesional = admin
      ? await ingresosPorProfesional(reservasPasadas, empresaId, rangoVentas)
      : [];

    return ok(res, {
      alcance: alcanceDe(req),
      esAdmin: admin,
      mes,
      anio,
      ingresoTotal: ingresoTotalMes,
      ingresoVentasDirectas,
      porProfesional,
      detalle: {
        ingresoReservas,
        ingresoProductos,
        ingresoExtras,
        ingresoSuscripciones,
        suscripcionesNuevas: suscripcionesMes,
        ingresoVentasDirectas,
        // En meses pasados no tiene sentido proyectar
        posibleIngreso: esMesActual ? ingresoTotalMes + posibleIngreso : null,
      },
    });
  } catch (error) {
    console.error("❌ Error ingresosPorMes:", error);
    return err(res, "Error al obtener ingresos del mes");
  }
};
/* =====================================================
   ESTADÍSTICAS DE PRODUCTOS

   Ventas → acotadas al profesional si no es admin
   Stock  → siempre de la empresa (el inventario es compartido)
===================================================== */
export const estadisticasProductos = async (req, res) => {
  try {
    const empresaId = req.usuario?.empresaId;
    if (!empresaId) return err(res, "Empresa no identificada", 400);

    const filtro = filtroBarbero(req);
    const hoy = new Date();
    const { inicio: inicioMes } = rangoMes(hoy.getFullYear(), hoy.getMonth());

    const [reservas, stockBajo] = await Promise.all([
      reservaModel
        .find({
          empresa: empresaId,
          ...filtro,
          estado: ESTADOS_VALIDOS,
          fecha: { $gte: inicioMes, $lte: hoy },
          "productos.0": { $exists: true },
        })
        .populate("cliente", "nombre apellido")
        .select("fecha cliente productos")
        .sort({ fecha: -1 })
        .lean(),

      productoModel
        .find({
          empresa: empresaId,
          activo: true,
          stock: { $ne: null, $lte: 3, $gt: 0 },
        })
        .select("nombre stock")
        .lean(),
    ]);

    // ── 1. Ventas recientes ──
    const ventasRecientes = reservas.flatMap((r) =>
      r.productos.map((p) => ({
        fecha: r.fecha,
        cliente: r.cliente
          ? `${r.cliente.nombre} ${r.cliente.apellido}`
          : "Cliente",
        producto: p.nombre,
        cantidad: p.cantidad,
        subtotal: p.subtotal,
      })),
    );

    // ── 2. Más vendidos ──
    const mapaProductos = new Map();
    for (const venta of ventasRecientes) {
      const actual = mapaProductos.get(venta.producto) || {
        nombre: venta.producto,
        unidades: 0,
        total: 0,
      };
      actual.unidades += venta.cantidad;
      actual.total += venta.subtotal;
      mapaProductos.set(venta.producto, actual);
    }

    const masVendidos = [...mapaProductos.values()].sort(
      (a, b) => b.unidades - a.unidades,
    );

    // ── 3. Total del mes ──
    const totalMes = ventasRecientes.reduce((acc, v) => acc + v.subtotal, 0);

    return ok(res, {
      alcance: alcanceDe(req),
      esAdmin: esAdmin(req),
      totalMes,
      ventasRecientes,
      masVendidos,
      stockBajo,
    });
  } catch (error) {
    console.error("❌ Error estadisticasProductos:", error);
    return err(res, "Error al obtener estadísticas de productos");
  }
};
