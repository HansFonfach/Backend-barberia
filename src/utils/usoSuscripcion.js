// utils/usoSuscripcion.js
//
// Uso de una suscripción contado DESDE LAS RESERVAS del cliente, con un solo
// criterio para la lista de suscripciones y para el detalle de visitas.
//
// Qué cuenta como servicio usado:
//  - Reservas no canceladas y no reagendadas (la reagendada fue reemplazada
//    por otra reserva; contar las dos descontaba el doble).
//  - "no_asistio" SÍ cuenta (es lo que ya hacía el sistema), pero se marca en
//    el detalle para que el barbero lo vea.
//  - Solo los servicios que incluye el plan (planes antiguos: IDs fijos;
//    planes creados en la app: los servicios elegidos en el plan).
//
// Período que se compara contra el total del plan:
//  - Planes antiguos y planes de un solo ciclo: toda la suscripción.
//  - Planes con ciclos (ej. anual con 2 servicios por mes): el ciclo actual
//    o, si ya venció, el último ciclo.
import reservaModel from "../models/reserva.model.js";

const MS_POR_DIA = 24 * 60 * 60 * 1000;

// IDs fijos de los planes antiguos (mismos que usa el resto del sistema)
const SERVICIO_COMBO_ID = "69934ce087e49726a2cd3da1";
const SERVICIO_BARBA_ID = "6993a5495dada31f33304c19";

const ESTADOS_QUE_NO_CUENTAN = ["cancelada", "reagendada"];

/** ¿Esta reserva descuenta del plan? → { cuenta, peso, motivo } */
export const cuentaParaPlan = (sus, reserva) => {
  if (reserva.estado === "cancelada") return { cuenta: false, peso: 0, motivo: "Cancelada" };
  if (reserva.estado === "reagendada") {
    return { cuenta: false, peso: 0, motivo: "Reagendada (cuenta la nueva fecha)" };
  }

  const servicioId = (reserva.servicio?._id || reserva.servicio)?.toString();
  const noIncluido = { cuenta: false, peso: 0, motivo: "Servicio no incluido en el plan" };

  if (sus.tipoPlan === "plan_personalizado") {
    const permitidos = (sus.planSnapshot?.serviciosPermitidos || []).map((s) => s.toString());
    if (permitidos.length && !permitidos.includes(servicioId)) return noIncluido;
    return { cuenta: true, peso: 1, motivo: "" };
  }
  if (sus.tipoPlan === "combo_visita_corte_barba") {
    return servicioId === SERVICIO_COMBO_ID ? { cuenta: true, peso: 1, motivo: "" } : noIncluido;
  }
  if (sus.tipoPlan === "barba") {
    return servicioId === SERVICIO_BARBA_ID ? { cuenta: true, peso: 1, motivo: "" } : noIncluido;
  }
  // "creditos" y "padre_e_hijo": cualquier servicio; los de 2 horas o más valen 2
  const peso = reserva.duracion >= 120 ? 2 : 1;
  return { cuenta: true, peso, motivo: peso === 2 ? "Servicio largo: vale 2" : "" };
};

/** Período con el que se compara el total del plan (ver arriba). */
export const periodoDeReferencia = (sus, ahora = new Date()) => {
  const inicio = new Date(sus.fechaInicio);
  const fin = new Date(sus.fechaFin);
  const snap = sus.planSnapshot || {};

  if (sus.tipoPlan !== "plan_personalizado") {
    return { desde: inicio, hasta: fin, total: sus.serviciosTotales ?? 2, esCiclo: false };
  }

  const duracionDias = snap.duracionDias || 30;
  const cicloDias = Math.min(snap.cicloDias || duracionDias, duracionDias);
  const total = snap.cantidadPorCiclo ?? sus.serviciosTotales ?? 1;
  if (cicloDias >= duracionDias) return { desde: inicio, hasta: fin, total, esCiclo: false };

  // Con ciclos: el ciclo que contiene "ahora" (o el último, si ya venció)
  const referencia = Math.min(ahora.getTime(), fin.getTime() - 1);
  const numero = Math.max(0, Math.floor((referencia - inicio.getTime()) / (cicloDias * MS_POR_DIA)));
  const desde = new Date(inicio.getTime() + numero * cicloDias * MS_POR_DIA);
  let hasta = new Date(desde.getTime() + cicloDias * MS_POR_DIA);
  if (hasta > fin) hasta = fin;
  return { desde, hasta, total, esCiclo: true, numeroCiclo: numero + 1 };
};

/**
 * Uso de una suscripción. Con `detalle: true` además devuelve cada reserva
 * del cliente durante toda la suscripción (para el historial de visitas).
 */
export const usoSuscripcion = async (sus, { ahora = new Date(), detalle = false } = {}) => {
  const clienteId = sus.usuario?._id || sus.usuario;
  const periodo = periodoDeReferencia(sus, ahora);

  let consulta = reservaModel
    .find({
      cliente: clienteId,
      empresa: sus.empresa,
      fecha: { $gte: new Date(sus.fechaInicio), $lte: new Date(sus.fechaFin) },
    })
    .sort({ fecha: 1 });
  if (detalle) {
    consulta = consulta.populate("servicio", "nombre").populate("barbero", "nombre apellido");
  }
  const reservas = await consulta.lean();

  let usados = 0;
  let agendados = 0; // reservas futuras que ya descuentan
  const filas = [];
  for (const r of reservas) {
    const c = cuentaParaPlan(sus, r);
    const fecha = new Date(r.fecha);
    const enPeriodo = fecha >= periodo.desde && fecha <= periodo.hasta;
    if (c.cuenta && enPeriodo) {
      usados += c.peso;
      if (fecha > ahora && r.estado !== "no_asistio") agendados += c.peso;
    }
    if (detalle) {
      filas.push({
        _id: r._id,
        fecha: r.fecha,
        estado: r.estado,
        servicio: r.servicio?.nombre || "Servicio",
        barbero: r.barbero ? `${r.barbero.nombre || ""} ${r.barbero.apellido || ""}`.trim() : "",
        cuenta: c.cuenta,
        peso: c.peso,
        motivo: c.motivo || (r.estado === "no_asistio" ? "No asistió (igual se descuenta)" : ""),
        futura: fecha > ahora,
        enPeriodo,
      });
    }
  }

  return {
    usados,
    agendados,
    total: periodo.total,
    restantes: Math.max(0, periodo.total - usados),
    periodo: { desde: periodo.desde, hasta: periodo.hasta, esCiclo: periodo.esCiclo, numeroCiclo: periodo.numeroCiclo || null },
    ...(detalle ? { reservas: filas } : {}),
  };
};
