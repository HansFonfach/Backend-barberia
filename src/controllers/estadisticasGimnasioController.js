import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import mongoose from "mongoose";

import InscripcionClaseModel from "../models/inscripcionClase.model.js";
import MembresiaClaseModel from "../models/membresiaClase.model.js";
import SolicitudMembresiaClaseModel from "../models/solicitudMembresiaClase.model.js";
import UsuarioModel from "../models/usuario.model.js";
import ventaDirectaModel from "../models/ventaDirecta.model.js";
import ClaseModel from "../models/clase.model.js";
import ExcepcionClaseModel from "../models/excepcionClase.model.js";
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

// dayjs no tiene el locale "es" cargado en el backend (y no queremos
// mutar dayjs.locale() acá porque es un estado global que afectaría el
// .format() de TODOS los demás controllers que comparten esta misma
// instancia de dayjs). Por eso las etiquetas de mes se arman a mano.
const MESES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const MESES_ES_CORTO = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];
const nombreMes = (fechaDayjs) => MESES_ES[fechaDayjs.month()];
const nombreMesCorto = (fechaDayjs) => MESES_ES_CORTO[fechaDayjs.month()];
const capitalizar = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

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

/* =========================================================================
   ⭐ PANEL DE ESTADÍSTICAS COMPLETO (selector de período + comparación)
   =========================================================================
   Todo lo de acá abajo reutiliza los mismos modelos, el mismo criterio de
   "asistencia" (inscripción confirmada a una sesión ya pasada — no hay
   check-in aparte, mismo criterio ya usado para cupos) y, sobre todo, el
   mismo generarSesionesDisponibles() que ya usan "Clases del día" y el
   catálogo público, para que estos números nunca queden desincronizados
   de lo que el admin ve en el resto del sistema.
========================================================================= */

const PERIODOS_VALIDOS = [
  "este_mes",
  "mes_anterior",
  "ultimos_3_meses",
  "ultimos_6_meses",
  "este_anio",
  "anio_anterior",
  "personalizado",
];

/**
 * Resuelve un preset del selector de período (o un rango personalizado
 * desde/hasta) a {inicio, fin} + el tramo de comparación.
 *
 * La comparación es siempre el tramo INMEDIATAMENTE ANTERIOR: para
 * "este_mes"/"mes_anterior" es el mes calendario anterior completo (más
 * intuitivo — "agosto vs julio"); para "este_año" es el mismo tramo del
 * año anterior (1 ene - hoy vs 1 ene - hoy del año pasado, no el año
 * completo, para no comparar 8 meses contra 12); para el resto es un
 * tramo de la misma duración en días, pegado justo antes.
 */
const resolverPeriodo = (query = {}) => {
  const { periodo = "este_mes", desde, hasta } = query;
  const ahora = dayjs().tz(TZ);

  if (!PERIODOS_VALIDOS.includes(periodo)) {
    return { error: "Período inválido" };
  }

  let inicio, fin, inicioComparacion, finComparacion, etiqueta, etiquetaComparacion;

  switch (periodo) {
    case "este_mes": {
      inicio = ahora.startOf("month");
      fin = ahora.endOf("month");
      const anterior = ahora.subtract(1, "month");
      inicioComparacion = anterior.startOf("month");
      finComparacion = anterior.endOf("month");
      etiqueta = `${capitalizar(nombreMes(ahora))} ${ahora.format("YYYY")}`;
      etiquetaComparacion = `${capitalizar(nombreMes(anterior))} ${anterior.format("YYYY")}`;
      break;
    }
    case "mes_anterior": {
      const base = ahora.subtract(1, "month");
      const anterior = base.subtract(1, "month");
      inicio = base.startOf("month");
      fin = base.endOf("month");
      inicioComparacion = anterior.startOf("month");
      finComparacion = anterior.endOf("month");
      etiqueta = `${capitalizar(nombreMes(base))} ${base.format("YYYY")}`;
      etiquetaComparacion = `${capitalizar(nombreMes(anterior))} ${anterior.format("YYYY")}`;
      break;
    }
    case "ultimos_3_meses":
    case "ultimos_6_meses": {
      const cantidad = periodo === "ultimos_3_meses" ? 3 : 6;
      inicio = ahora.subtract(cantidad - 1, "month").startOf("month");
      fin = ahora.endOf("month");
      const dias = fin.diff(inicio, "day") + 1;
      finComparacion = inicio.subtract(1, "day").endOf("day");
      inicioComparacion = finComparacion.subtract(dias - 1, "day").startOf("day");
      etiqueta = `${nombreMesCorto(inicio)} - ${nombreMesCorto(fin)} ${fin.format("YYYY")}`;
      etiquetaComparacion = `${nombreMesCorto(inicioComparacion)} - ${nombreMesCorto(finComparacion)} ${finComparacion.format("YYYY")}`;
      break;
    }
    case "este_anio": {
      inicio = ahora.startOf("year");
      fin = ahora.endOf("year");
      inicioComparacion = inicio.subtract(1, "year");
      finComparacion = ahora.subtract(1, "year").endOf("day");
      etiqueta = ahora.format("YYYY");
      etiquetaComparacion = ahora.subtract(1, "year").format("YYYY");
      break;
    }
    case "anio_anterior": {
      const base = ahora.subtract(1, "year");
      const anterior = base.subtract(1, "year");
      inicio = base.startOf("year");
      fin = base.endOf("year");
      inicioComparacion = anterior.startOf("year");
      finComparacion = anterior.endOf("year");
      etiqueta = base.format("YYYY");
      etiquetaComparacion = anterior.format("YYYY");
      break;
    }
    case "personalizado": {
      if (!desde || !hasta) {
        return { error: "Debes enviar 'desde' y 'hasta' para un rango personalizado" };
      }
      inicio = dayjs.tz(desde, TZ).startOf("day");
      fin = dayjs.tz(hasta, TZ).endOf("day");
      if (fin.isBefore(inicio)) {
        return { error: "El rango de fechas es inválido" };
      }
      const dias = fin.diff(inicio, "day") + 1;
      finComparacion = inicio.subtract(1, "day").endOf("day");
      inicioComparacion = finComparacion.subtract(dias - 1, "day").startOf("day");
      etiqueta = `${inicio.format("DD/MM/YYYY")} - ${fin.format("DD/MM/YYYY")}`;
      etiquetaComparacion = `${inicioComparacion.format("DD/MM/YYYY")} - ${finComparacion.format("DD/MM/YYYY")}`;
      break;
    }
  }

  return {
    inicio: inicio.toDate(),
    fin: fin.toDate(),
    inicioComparacion: inicioComparacion.toDate(),
    finComparacion: finComparacion.toDate(),
    etiqueta,
    etiquetaComparacion,
  };
};

/** Igual convención que ya usa getIngresosGimnasio: null si no hay base para comparar */
const variacion = (actual, anterior) =>
  anterior > 0 ? Math.round(((actual - anterior) / anterior) * 100) : null;

/**
 * Clases + asistencias de un rango. Reutiliza generarSesionesDisponibles
 * en vez de reconstruir el cruce horarioSemanal × excepciones × cupos a
 * mano (eso ya lo resuelve ese helper y así nunca se desincroniza).
 *
 * - realizadas: sesiones ya pasadas dentro del rango CON al menos 1
 *   inscrito (no cuenta una sesión del horario semanal donde nadie se
 *   inscribió — si no, el número refleja el horario configurado y no el
 *   uso real del gimnasio)
 * - programadas: mismo criterio pero sesiones futuras dentro del rango
 * - canceladas: ExcepcionClase tipo "cancelada" en el rango (el admin
 *   canceló la sesión completa — distinto de que un cliente cancele su
 *   cupo individual, eso ya se descuenta solo porque solo se cuentan
 *   inscripciones "confirmada")
 * - totalAsistencias: suma de inscritos en sesiones realizadas
 */
const calcularClasesYAsistencias = async (empresaId, inicio, fin) => {
  const ahora = new Date();

  const [resultado, claseIds] = await Promise.all([
    generarSesionesDisponibles({
      empresaId,
      desde: dayjs(inicio).tz(TZ).format("YYYY-MM-DD"),
      hasta: dayjs(fin).tz(TZ).format("YYYY-MM-DD"),
      incluirPasadas: true,
    }),
    ClaseModel.find({ empresa: toId(empresaId), activa: true }).distinct("_id"),
  ]);

  // "Realizada"/"programada" exige al menos 1 inscrito: una sesión del
  // horario semanal sin nadie inscrito no cuenta como clase real (si no,
  // el número refleja el horario configurado y no el uso real del gimnasio).
  const sesiones = resultado.sesiones || [];
  const realizadas = sesiones.filter((s) => new Date(s.fecha) < ahora && s.inscritos > 0);
  const programadas = sesiones.filter((s) => new Date(s.fecha) >= ahora && s.inscritos > 0);

  const canceladas = await ExcepcionClaseModel.countDocuments({
    clase: { $in: claseIds },
    tipo: "cancelada",
    fecha: { $gte: inicio, $lte: fin },
  });

  const totalAsistencias = realizadas.reduce((acc, s) => acc + s.inscritos, 0);
  const cupoTotalRealizadas = realizadas.reduce((acc, s) => acc + s.cupoMaximo, 0);

  const porDia = Array.from({ length: 7 }, () => ({ asistencias: 0, clases: 0 }));
  for (const s of realizadas) {
    const dia = dayjs(s.fecha).tz(TZ).day();
    porDia[dia].asistencias += s.inscritos;
    porDia[dia].clases += 1;
  }

  return {
    realizadas: realizadas.length,
    programadas: programadas.length,
    canceladas,
    totalAsistencias,
    promedioAsistentesPorClase:
      realizadas.length > 0 ? Number((totalAsistencias / realizadas.length).toFixed(1)) : 0,
    tasaOcupacion:
      cupoTotalRealizadas > 0 ? Number(((totalAsistencias / cupoTotalRealizadas) * 100).toFixed(1)) : 0,
    promedioPorDia: porDia.map((d, i) => ({
      dia: i,
      totalAsistencias: d.asistencias,
      clases: d.clases,
      promedio: d.clases > 0 ? Number((d.asistencias / d.clases).toFixed(1)) : 0,
    })),
  };
};

/* =======================================================
   🟢 Resumen del período: KPIs principales + comparación contra el
   tramo anterior. GET /estadisticasGimnasio/resumen?periodo=este_mes
   (o periodo=personalizado&desde=YYYY-MM-DD&hasta=YYYY-MM-DD)
======================================================= */
export const getResumenPeriodoGimnasio = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const periodo = resolverPeriodo(req.query);
    if (periodo.error) return err(res, periodo.error, 400);

    const { inicio, fin, inicioComparacion, finComparacion, etiqueta, etiquetaComparacion } = periodo;
    const ahora = new Date();
    const en7Dias = dayjs(ahora).add(7, "day").toDate();
    const finParaAsistencia = fin < ahora ? fin : ahora;

    const [
      clasesActual,
      clasesAnterior,
      membresiasNuevas,
      pasesDiarios,
      ventasDirectas,
      membresiasNuevasAnt,
      pasesDiariosAnt,
      ventasDirectasAnt,
      membresiasActivas,
      membresiasActivasAnt,
      porVencer,
      clientesNuevos,
      clientesNuevosAnt,
      clientesActivosIds,
      clientesActivosAntIds,
    ] = await Promise.all([
      calcularClasesYAsistencias(empresaId, inicio, fin),
      calcularClasesYAsistencias(empresaId, inicioComparacion, finComparacion),
      sumarMembresiasNuevas(empresaId, inicio, fin),
      sumarPasesDiarios(empresaId, inicio, fin),
      sumarVentasDirectas(empresaId, inicio, fin),
      sumarMembresiasNuevas(empresaId, inicioComparacion, finComparacion),
      sumarPasesDiarios(empresaId, inicioComparacion, finComparacion),
      sumarVentasDirectas(empresaId, inicioComparacion, finComparacion),
      MembresiaClaseModel.countDocuments({
        empresa: toId(empresaId),
        fechaInicio: { $lte: fin },
        fechaFin: { $gte: inicio },
      }),
      MembresiaClaseModel.countDocuments({
        empresa: toId(empresaId),
        fechaInicio: { $lte: finComparacion },
        fechaFin: { $gte: inicioComparacion },
      }),
      MembresiaClaseModel.countDocuments({
        empresa: toId(empresaId),
        activa: true,
        fechaFin: { $gte: ahora, $lte: en7Dias },
      }),
      UsuarioModel.countDocuments({
        empresa: toId(empresaId),
        rol: { $in: ["cliente", "invitado"] },
        estado: "activo",
        createdAt: { $gte: inicio, $lte: fin },
      }),
      UsuarioModel.countDocuments({
        empresa: toId(empresaId),
        rol: { $in: ["cliente", "invitado"] },
        estado: "activo",
        createdAt: { $gte: inicioComparacion, $lte: finComparacion },
      }),
      InscripcionClaseModel.distinct("cliente", {
        empresa: toId(empresaId),
        estado: "confirmada",
        fecha: { $gte: inicio, $lte: finParaAsistencia },
      }),
      InscripcionClaseModel.distinct("cliente", {
        empresa: toId(empresaId),
        estado: "confirmada",
        fecha: { $gte: inicioComparacion, $lte: finComparacion },
      }),
    ]);

    const ingresoTotal = membresiasNuevas.total + pasesDiarios.total + ventasDirectas;
    const ingresoAnterior = membresiasNuevasAnt.total + pasesDiariosAnt.total + ventasDirectasAnt;
    const clientesActivos = clientesActivosIds.length;
    const clientesActivosAnt = clientesActivosAntIds.length;

    return ok(res, {
      periodo: {
        tipo: req.query.periodo || "este_mes",
        inicio,
        fin,
        etiqueta,
        inicioComparacion,
        finComparacion,
        etiquetaComparacion,
      },
      clases: {
        realizadas: clasesActual.realizadas,
        programadas: clasesActual.programadas,
        canceladas: clasesActual.canceladas,
        variacionCanceladas: variacion(clasesActual.canceladas, clasesAnterior.canceladas),
      },
      asistencias: {
        total: clasesActual.totalAsistencias,
        variacionPorcentaje: variacion(clasesActual.totalAsistencias, clasesAnterior.totalAsistencias),
        promedioPorClase: clasesActual.promedioAsistentesPorClase,
        tasaOcupacion: clasesActual.tasaOcupacion,
        promedioPorDia: clasesActual.promedioPorDia,
      },
      ingresos: {
        total: ingresoTotal,
        totalAnterior: ingresoAnterior,
        variacionPorcentaje: variacion(ingresoTotal, ingresoAnterior),
        detalle: {
          membresias: membresiasNuevas.total,
          membresiasCantidad: membresiasNuevas.cantidad,
          pasesDiarios: pasesDiarios.total,
          pasesDiariosCantidad: pasesDiarios.cantidad,
          productos: ventasDirectas,
        },
      },
      membresias: {
        activas: membresiasActivas,
        variacionActivas: variacion(membresiasActivas, membresiasActivasAnt),
        nuevas: membresiasNuevas.cantidad,
        variacionNuevas: variacion(membresiasNuevas.cantidad, membresiasNuevasAnt.cantidad),
        porVencer,
      },
      clientes: {
        nuevos: clientesNuevos,
        variacionNuevos: variacion(clientesNuevos, clientesNuevosAnt),
        activos: clientesActivos,
        variacionActivos: variacion(clientesActivos, clientesActivosAnt),
      },
    });
  } catch (error) {
    console.error("Error al obtener el resumen de estadísticas del gimnasio:", error);
    return err(res, "Error interno al obtener el resumen de estadísticas");
  }
};

/* =======================================================
   🟣 Análisis de clientes del período: top asistentes, clientes que
   bajaron su asistencia, nuevos, por vencer, en riesgo de abandono y
   retención (esta última solo si hay base suficiente para ser confiable).
   GET /estadisticasGimnasio/clientes-analisis?periodo=este_mes
======================================================= */
export const getClientesAnalisisGimnasio = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const periodo = resolverPeriodo(req.query);
    if (periodo.error) return err(res, periodo.error, 400);

    const { inicio, fin, inicioComparacion, finComparacion } = periodo;
    const ahora = new Date();
    const en7Dias = dayjs(ahora).add(7, "day").toDate();
    const finParaAsistencia = fin < ahora ? fin : ahora;

    const [
      topAsistentes,
      asistenciaActualPorCliente,
      asistenciaAnteriorPorCliente,
      clientesNuevos,
      porVencer,
      membresiasActivasHoy,
      clientesConAsistenciaRecienteIds,
    ] = await Promise.all([
      InscripcionClaseModel.aggregate([
        {
          $match: {
            empresa: toId(empresaId),
            estado: "confirmada",
            fecha: { $gte: inicio, $lte: finParaAsistencia },
          },
        },
        { $group: { _id: "$cliente", totalAsistencias: { $sum: 1 } } },
        { $sort: { totalAsistencias: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "usuarios",
            localField: "_id",
            foreignField: "_id",
            as: "cliente",
          },
        },
        { $unwind: "$cliente" },
        {
          $project: {
            _id: 0,
            clienteId: "$_id",
            nombre: "$cliente.nombre",
            apellido: "$cliente.apellido",
            email: "$cliente.email",
            totalAsistencias: 1,
          },
        },
      ]),
      InscripcionClaseModel.aggregate([
        { $match: { empresa: toId(empresaId), estado: "confirmada", fecha: { $gte: inicio, $lte: fin } } },
        { $group: { _id: "$cliente", total: { $sum: 1 } } },
      ]),
      InscripcionClaseModel.aggregate([
        {
          $match: {
            empresa: toId(empresaId),
            estado: "confirmada",
            fecha: { $gte: inicioComparacion, $lte: finComparacion },
          },
        },
        { $group: { _id: "$cliente", total: { $sum: 1 } } },
      ]),
      UsuarioModel.find({
        empresa: toId(empresaId),
        rol: { $in: ["cliente", "invitado"] },
        estado: "activo",
        createdAt: { $gte: inicio, $lte: fin },
      })
        .select("nombre apellido email createdAt")
        .sort({ createdAt: -1 })
        .lean(),
      MembresiaClaseModel.find({
        empresa: toId(empresaId),
        activa: true,
        fechaFin: { $gte: ahora, $lte: en7Dias },
      })
        .populate("cliente", "nombre apellido email")
        .select("cliente fechaFin")
        .sort({ fechaFin: 1 })
        .lean(),
      MembresiaClaseModel.find({ empresa: toId(empresaId), activa: true, fechaFin: { $gte: ahora } })
        .populate("cliente", "nombre apellido email")
        .select("cliente fechaFin")
        .lean(),
      InscripcionClaseModel.distinct("cliente", {
        empresa: toId(empresaId),
        estado: "confirmada",
        fecha: { $gte: dayjs(ahora).subtract(14, "day").toDate(), $lte: ahora },
      }),
    ]);

    // Clientes cuya asistencia cayó ≥40% respecto al período anterior
    // (mínimo 2 asistencias en el período anterior, para no marcar a
    // alguien que solo fue una vez como "en caída").
    const mapaAnterior = new Map(asistenciaAnteriorPorCliente.map((c) => [String(c._id), c.total]));
    const mapaActual = new Map(asistenciaActualPorCliente.map((c) => [String(c._id), c.total]));

    const caidas = [];
    for (const [id, anterior] of mapaAnterior) {
      if (anterior < 2) continue;
      const actual = mapaActual.get(id) || 0;
      const cambioPorcentaje = Math.round(((actual - anterior) / anterior) * 100);
      if (cambioPorcentaje <= -40) {
        caidas.push({ clienteId: id, asistenciasAnterior: anterior, asistenciasActual: actual, cambioPorcentaje });
      }
    }
    caidas.sort((a, b) => a.cambioPorcentaje - b.cambioPorcentaje);
    const top10Caidas = caidas.slice(0, 10);

    const usuariosCaida = await UsuarioModel.find({ _id: { $in: top10Caidas.map((c) => c.clienteId) } })
      .select("nombre apellido email")
      .lean();
    const usuarioPorId = new Map(usuariosCaida.map((u) => [String(u._id), u]));

    const clientesEnCaida = top10Caidas.map((c) => ({
      ...c,
      nombre: usuarioPorId.get(c.clienteId)?.nombre,
      apellido: usuarioPorId.get(c.clienteId)?.apellido,
      email: usuarioPorId.get(c.clienteId)?.email,
    }));

    // Clientes en riesgo de abandono: tienen membresía activa hoy pero
    // no registran asistencia confirmada en los últimos 14 días.
    const idsConAsistenciaReciente = new Set(clientesConAsistenciaRecienteIds.map(String));
    const clientesEnRiesgo = membresiasActivasHoy
      .filter((m) => m.cliente && !idsConAsistenciaReciente.has(String(m.cliente._id)))
      .map((m) => ({
        clienteId: m.cliente._id,
        nombre: m.cliente.nombre,
        apellido: m.cliente.apellido,
        email: m.cliente.email,
        membresiaVenceEl: m.fechaFin,
      }));

    // Retención: % de clientes con asistencia en el período anterior que
    // volvió a asistir en el actual. Solo se muestra con base mínima de
    // 5 clientes (si no, el porcentaje no dice nada confiable).
    let retencion = null;
    if (mapaAnterior.size >= 5) {
      const repiten = [...mapaAnterior.keys()].filter((id) => mapaActual.has(id)).length;
      retencion = {
        porcentaje: Math.round((repiten / mapaAnterior.size) * 100),
        baseClientes: mapaAnterior.size,
      };
    }

    return ok(res, {
      topAsistentes,
      clientesEnCaida,
      clientesNuevos,
      clientesPorVencer: porVencer.map((m) => ({
        clienteId: m.cliente?._id,
        nombre: m.cliente?.nombre,
        apellido: m.cliente?.apellido,
        email: m.cliente?.email,
        fechaFin: m.fechaFin,
      })),
      clientesEnRiesgo,
      retencion,
    });
  } catch (error) {
    console.error("Error al obtener el análisis de clientes del gimnasio:", error);
    return err(res, "Error interno al obtener el análisis de clientes");
  }
};

/* =======================================================
   🟠 Demanda: días de semana, horarios y clases con mayor/menor
   asistencia + % de ocupación por clase, dentro del período elegido.
   GET /estadisticasGimnasio/demanda?periodo=este_mes
======================================================= */
export const getDemandaGimnasio = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const periodo = resolverPeriodo(req.query);
    if (periodo.error) return err(res, periodo.error, 400);

    const { inicio, fin } = periodo;

    const resultado = await generarSesionesDisponibles({
      empresaId,
      desde: dayjs(inicio).tz(TZ).format("YYYY-MM-DD"),
      hasta: dayjs(fin).tz(TZ).format("YYYY-MM-DD"),
      incluirPasadas: true,
    });
    if (resultado.error) return err(res, resultado.error.message, resultado.error.status);

    const ahora = new Date();
    // Mismo criterio que calcularClasesYAsistencias: solo sesiones con
    // al menos 1 inscrito cuentan como "realizadas".
    const realizadas = (resultado.sesiones || []).filter(
      (s) => new Date(s.fecha) < ahora && s.inscritos > 0,
    );

    const porDia = Array.from({ length: 7 }, () => ({ asistencias: 0, clases: 0 }));
    const porHora = new Map();
    const porClase = new Map();

    for (const s of realizadas) {
      const momento = dayjs(s.fecha).tz(TZ);

      const dia = momento.day();
      porDia[dia].asistencias += s.inscritos;
      porDia[dia].clases += 1;

      const hora = momento.format("HH:mm");
      const actualHora = porHora.get(hora) || { hora, asistencias: 0, sesiones: 0 };
      actualHora.asistencias += s.inscritos;
      actualHora.sesiones += 1;
      porHora.set(hora, actualHora);

      const key = String(s.claseId);
      const actualClase = porClase.get(key) || {
        claseId: s.claseId,
        nombre: s.nombre,
        asistencias: 0,
        cupoTotal: 0,
        sesiones: 0,
      };
      actualClase.asistencias += s.inscritos;
      actualClase.cupoTotal += s.cupoMaximo;
      actualClase.sesiones += 1;
      porClase.set(key, actualClase);
    }

    const diasSemana = porDia.map((d, i) => ({
      dia: i,
      asistencias: d.asistencias,
      clases: d.clases,
      promedio: d.clases > 0 ? Number((d.asistencias / d.clases).toFixed(1)) : 0,
    }));

    const horarios = [...porHora.values()]
      .map((h) => ({ ...h, promedio: h.sesiones > 0 ? Number((h.asistencias / h.sesiones).toFixed(1)) : 0 }))
      .sort((a, b) => b.asistencias - a.asistencias);

    const clases = [...porClase.values()]
      .map((c) => ({
        ...c,
        ocupacionPorcentaje: c.cupoTotal > 0 ? Math.round((c.asistencias / c.cupoTotal) * 100) : 0,
        promedioAsistentes: c.sesiones > 0 ? Number((c.asistencias / c.sesiones).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.asistencias - a.asistencias);

    return ok(res, {
      diasSemana,
      horariosTop: horarios.slice(0, 5),
      horariosBajos: [...horarios].sort((a, b) => a.asistencias - b.asistencias).slice(0, 5),
      clasesTop: clases.slice(0, 5),
      clasesBajas: [...clases].sort((a, b) => a.asistencias - b.asistencias).slice(0, 5),
    });
  } catch (error) {
    console.error("Error al obtener la demanda del gimnasio:", error);
    return err(res, "Error interno al obtener la demanda");
  }
};

/* =======================================================
   🔵 Evolución mensual (para gráficos de línea/barras): ingresos,
   asistencias, membresías activas y clientes activos mes a mes.
   GET /estadisticasGimnasio/evolucion?meses=6
======================================================= */
export const getEvolucionGimnasio = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const meses = Math.min(Math.max(parseInt(req.query.meses) || 6, 1), 24);
    const ahora = dayjs().tz(TZ);

    const rangosMensuales = Array.from({ length: meses }, (_, i) => {
      const base = ahora.subtract(meses - 1 - i, "month");
      return {
        etiqueta: `${nombreMesCorto(base)} ${base.format("YYYY")}`,
        inicio: base.startOf("month").toDate(),
        fin: base.endOf("month").toDate(),
      };
    });

    const evolucion = await Promise.all(
      rangosMensuales.map(async ({ etiqueta, inicio, fin }) => {
        const [membresias, pases, productos, asistencias, membresiasActivas, clientesActivosIds] =
          await Promise.all([
            sumarMembresiasNuevas(empresaId, inicio, fin),
            sumarPasesDiarios(empresaId, inicio, fin),
            sumarVentasDirectas(empresaId, inicio, fin),
            InscripcionClaseModel.countDocuments({
              empresa: toId(empresaId),
              estado: "confirmada",
              fecha: { $gte: inicio, $lte: fin },
            }),
            MembresiaClaseModel.countDocuments({
              empresa: toId(empresaId),
              fechaInicio: { $lte: fin },
              fechaFin: { $gte: inicio },
            }),
            InscripcionClaseModel.distinct("cliente", {
              empresa: toId(empresaId),
              estado: "confirmada",
              fecha: { $gte: inicio, $lte: fin },
            }),
          ]);

        return {
          etiqueta,
          ingresos: membresias.total + pases.total + productos,
          asistencias,
          membresiasActivas,
          clientesActivos: clientesActivosIds.length,
        };
      }),
    );

    return ok(res, { meses, evolucion });
  } catch (error) {
    console.error("Error al obtener la evolución del gimnasio:", error);
    return err(res, "Error interno al obtener la evolución");
  }
};
