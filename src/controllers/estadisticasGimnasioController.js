import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import mongoose from "mongoose";

import InscripcionClaseModel from "../models/inscripcionClase.model.js";
import MembresiaClaseModel from "../models/membresiaClase.model.js";
import SolicitudMembresiaClaseModel from "../models/solicitudMembresiaClase.model.js";
import UsuarioModel from "../models/usuario.model.js";
import ventaDirectaModel from "../models/ventaDirecta.model.js";
import { generarSesionesDisponibles } from "./claseController.js";

dayjs.extend(utc);
dayjs.extend(timezone);

// Estadísticas específicas para empresas con modulos.clasesGrupales = true
// (gimnasios/boxes). No reemplaza a estadisticasController.js (que sigue
// sirviendo a barberías/salones con su modelo de Reserva/Suscripcion): este
// archivo es su equivalente para el modelo de negocio de membresías + clases.

const TZ = "America/Santiago";

/* =====================================================
   UTIL (mismas convenciones que estadisticasController.js)
===================================================== */
const ok = (res, data) => res.json({ ok: true, data });
const err = (res, msg, status = 500) =>
  res.status(status).json({ ok: false, message: msg });

const toId = (valor) => new mongoose.Types.ObjectId(String(valor));

const rangoMes = (base = new Date()) => {
  const d = dayjs(base).tz(TZ);
  return { inicio: d.startOf("month").toDate(), fin: d.endOf("month").toDate() };
};

const rangoMesAnterior = (base = new Date()) =>
  rangoMes(dayjs(base).tz(TZ).subtract(1, "month").toDate());

/** Suma totalFinal de ventas directas (productos) en un rango de fechas */
const sumarVentasDirectas = async (empresaId, inicio, fin) => {
  const [resultado] = await ventaDirectaModel.aggregate([
    {
      $match: {
        empresa: toId(empresaId),
        anulada: false,
        fecha: { $gte: inicio, $lte: fin },
      },
    },
    { $group: { _id: null, total: { $sum: "$totalFinal" } } },
  ]);
  return resultado?.total || 0;
};

/** Membresías vendidas (creadas) en un rango: total $ + cantidad */
const sumarMembresiasNuevas = async (empresaId, inicio, fin) => {
  const [resultado] = await MembresiaClaseModel.aggregate([
    {
      $match: {
        empresa: toId(empresaId),
        fechaInicio: { $gte: inicio, $lte: fin },
      },
    },
    { $group: { _id: null, total: { $sum: "$precio" }, cantidad: { $sum: 1 } } },
  ]);
  return { total: resultado?.total || 0, cantidad: resultado?.cantidad || 0 };
};

/** Pases diarios ya pagados en un rango: total $ + cantidad */
const sumarPasesDiarios = async (empresaId, inicio, fin) => {
  const [resultado] = await InscripcionClaseModel.aggregate([
    {
      $match: {
        empresa: toId(empresaId),
        tipoAcceso: "pase_dia",
        "pago.estado": "pagado",
        estado: { $ne: "cancelada" },
        fecha: { $gte: inicio, $lte: fin },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$pago.monto" },
        cantidad: { $sum: 1 },
      },
    },
  ]);
  return { total: resultado?.total || 0, cantidad: resultado?.cantidad || 0 };
};

/* =======================================================
   🟢 Ingresos del mes: membresías + pases diarios + productos,
   con comparación vs. el mes anterior (dinero real, cobrado).
======================================================= */
export const getIngresosGimnasio = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const { inicio, fin } = rangoMes();
    const { inicio: inicioAnt, fin: finAnt } = rangoMesAnterior();

    const [membresias, pases, productos, membresiasAnt, pasesAnt, productosAnt] =
      await Promise.all([
        sumarMembresiasNuevas(empresaId, inicio, fin),
        sumarPasesDiarios(empresaId, inicio, fin),
        sumarVentasDirectas(empresaId, inicio, fin),
        sumarMembresiasNuevas(empresaId, inicioAnt, finAnt),
        sumarPasesDiarios(empresaId, inicioAnt, finAnt),
        sumarVentasDirectas(empresaId, inicioAnt, finAnt),
      ]);

    const total = membresias.total + pases.total + productos;
    const totalMesAnterior = membresiasAnt.total + pasesAnt.total + productosAnt;

    const variacionPorcentaje =
      totalMesAnterior > 0
        ? Math.round(((total - totalMesAnterior) / totalMesAnterior) * 100)
        : null;

    return ok(res, {
      total,
      totalMesAnterior,
      variacionPorcentaje,
      detalle: {
        membresias: membresias.total,
        membresiasCantidad: membresias.cantidad,
        pasesDiarios: pases.total,
        pasesDiariosCantidad: pases.cantidad,
        productos,
      },
    });
  } catch (error) {
    console.error("Error al obtener ingresos del gimnasio:", error);
    return err(res, "Error interno al obtener los ingresos");
  }
};

/* =======================================================
   🟡 Membresías: activas, nuevas del mes, por vencer en 7 días
   y solicitudes pendientes de revisión.
======================================================= */
export const getMembresiasGimnasio = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const ahora = new Date();
    const { inicio, fin } = rangoMes();
    const en7Dias = dayjs(ahora).add(7, "day").toDate();

    const [activas, nuevasDelMes, porVencer, solicitudesPendientes] =
      await Promise.all([
        MembresiaClaseModel.countDocuments({
          empresa: toId(empresaId),
          activa: true,
          fechaFin: { $gte: ahora },
        }),
        MembresiaClaseModel.countDocuments({
          empresa: toId(empresaId),
          fechaInicio: { $gte: inicio, $lte: fin },
        }),
        MembresiaClaseModel.countDocuments({
          empresa: toId(empresaId),
          activa: true,
          fechaFin: { $gte: ahora, $lte: en7Dias },
        }),
        SolicitudMembresiaClaseModel.countDocuments({
          empresa: toId(empresaId),
          estado: "pendiente",
        }),
      ]);

    return ok(res, { activas, nuevasDelMes, porVencer, solicitudesPendientes });
  } catch (error) {
    console.error("Error al obtener el resumen de membresías:", error);
    return err(res, "Error interno al obtener las membresías");
  }
};

/* =======================================================
   🔵 Clases de hoy: reutiliza EXACTAMENTE el mismo helper que usan
   "Clases del día" y el catálogo público, para que los cupos nunca
   se muestren distintos entre pantallas. incluirPasadas:true porque
   "hoy" también debe listar sesiones de la mañana que ya pasaron.
======================================================= */
export const getClasesHoyGimnasio = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const hoy = dayjs().tz(TZ).format("YYYY-MM-DD");

    const resultado = await generarSesionesDisponibles({
      empresaId,
      desde: hoy,
      hasta: hoy,
      incluirPasadas: true,
    });

    if (resultado.error) {
      return err(res, resultado.error.message, resultado.error.status);
    }

    const sesiones = resultado.sesiones || [];
    const ahora = dayjs().tz(TZ);
    const proxima =
      sesiones.find((s) => dayjs(s.fecha).tz(TZ).isAfter(ahora)) || null;

    return ok(res, { sesiones, proxima });
  } catch (error) {
    console.error("Error al obtener las clases de hoy:", error);
    return err(res, "Error interno al obtener las clases de hoy");
  }
};

/* =======================================================
   🟣 Clientes: cartera activa + nuevos registrados este mes
   (mismo criterio que ya usa estadisticasController.js para admin).
======================================================= */
export const getClientesGimnasio = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const { inicio, fin } = rangoMes();

    const [total, nuevosDelMes] = await Promise.all([
      UsuarioModel.countDocuments({
        empresa: toId(empresaId),
        rol: { $in: ["cliente", "invitado"] },
        estado: "activo",
      }),
      UsuarioModel.countDocuments({
        empresa: toId(empresaId),
        rol: { $in: ["cliente", "invitado"] },
        estado: "activo",
        createdAt: { $gte: inicio, $lte: fin },
      }),
    ]);

    return ok(res, { total, nuevosDelMes });
  } catch (error) {
    console.error("Error al obtener los clientes del gimnasio:", error);
    return err(res, "Error interno al obtener los clientes");
  }
};

/* =======================================================
   🔴 Por cobrar: clases agendadas con pago pendiente (dinero real
   que falta cobrar) + solicitudes de membresía pendientes de revisión
   (no es plata asegurada, es una acción pendiente del admin).
======================================================= */
export const getPorCobrarGimnasio = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;

    const [[pendientes], solicitudesPendientes] = await Promise.all([
      InscripcionClaseModel.aggregate([
        {
          $match: {
            empresa: toId(empresaId),
            "pago.estado": "pendiente",
            estado: { $ne: "cancelada" },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$pago.monto" },
            cantidad: { $sum: 1 },
          },
        },
      ]),
      SolicitudMembresiaClaseModel.countDocuments({
        empresa: toId(empresaId),
        estado: "pendiente",
      }),
    ]);

    return ok(res, {
      total: pendientes?.total || 0,
      cantidad: pendientes?.cantidad || 0,
      solicitudesPendientes,
    });
  } catch (error) {
    console.error("Error al obtener lo pendiente por cobrar:", error);
    return err(res, "Error interno al obtener lo pendiente por cobrar");
  }
};
