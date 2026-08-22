// utils/calcularEstadoPlanPersonalizado.js
//
// Calcula, para una Suscripcion creada a partir de un PlanSuscripcion
// (tipoPlan === "plan_personalizado"), cuántos servicios lleva usados en
// el ciclo actual y si sigue vigente. Es el equivalente, para planes
// personalizados, a los cálculos que suscripcionController.js ya hacía a
// mano para "creditos"/"combo_visita_corte_barba"/etc. — se deja aparte en
// un helper para no repetirlo en las 3 funciones que lo necesitan
// (estadoSuscripcionCliente, getSuscripcionActiva, listarSuscripciones) y
// para no tocar esa lógica vieja, que sigue intacta para las suscripciones
// antiguas.
//
// Importante: el conteo de uso se recalcula en tiempo real a partir de las
// reservas del cliente (mismo criterio que el resto del sistema), no de un
// contador manual — así no depende de que alguien marque el uso a mano.
import reservaModel from "../models/reserva.model.js";

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export const calcularEstadoPlanPersonalizado = async (suscripcion) => {
  const snap = suscripcion.planSnapshot || {};
  const duracionDias = snap.duracionDias || 30;
  const cicloDias = Math.min(snap.cicloDias || duracionDias, duracionDias);
  const cantidadPorCiclo = snap.cantidadPorCiclo ?? suscripcion.serviciosTotales ?? 1;
  const serviciosPermitidos = (snap.serviciosPermitidos || []).map((s) =>
    s.toString(),
  );

  const ahora = new Date();
  const fechaInicio = new Date(suscripcion.fechaInicio);
  const fechaFin = new Date(suscripcion.fechaFin);

  // Ciclo actual: en qué bloque de `cicloDias` días (contados desde el
  // inicio de la suscripción) estamos ahora mismo.
  const diasTranscurridos = Math.max(
    0,
    Math.floor((ahora.getTime() - fechaInicio.getTime()) / MS_POR_DIA),
  );
  const numeroCiclo = Math.floor(diasTranscurridos / cicloDias);

  const cicloInicio = new Date(
    fechaInicio.getTime() + numeroCiclo * cicloDias * MS_POR_DIA,
  );
  let cicloFin = new Date(cicloInicio.getTime() + cicloDias * MS_POR_DIA);
  if (cicloFin > fechaFin) cicloFin = fechaFin;

  const reservas = await reservaModel
    .find({
      cliente: suscripcion.usuario,
      fecha: { $gte: cicloInicio, $lte: cicloFin },
      estado: { $ne: "cancelada" },
    })
    .select("servicio");

  const serviciosUsadosCiclo =
    serviciosPermitidos.length > 0
      ? reservas.filter((r) => serviciosPermitidos.includes(r.servicio?.toString()))
          .length
      : reservas.length;

  const restantes = Math.max(0, cantidadPorCiclo - serviciosUsadosCiclo);
  const cicloAgotado = serviciosUsadosCiclo >= cantidadPorCiclo;

  // Un plan es "multi-ciclo" cuando dura más que un solo ciclo (ej. el
  // anual con reseteo mensual). En ese caso agotar la cuota del mes NO
  // termina la suscripción completa, solo bloquea hasta el próximo ciclo.
  // En un plan simple (1 solo ciclo, igual a como funcionaba siempre)
  // agotar la cuota SÍ termina la suscripción antes de tiempo.
  const esMultiCiclo = cicloDias < duracionDias;
  const vencePorTiempo = ahora > fechaFin;
  const terminaPorUso = !esMultiCiclo && cicloAgotado;

  return {
    cicloInicio,
    cicloFin,
    numeroCiclo,
    cantidadPorCiclo,
    serviciosUsadosCiclo,
    restantes,
    cicloAgotado,
    esMultiCiclo,
    vencePorTiempo,
    terminaPorUso,
    activa: !vencePorTiempo && !terminaPorUso,
  };
};
