// Reglas del módulo de canchas. Funciones puras (sin base de datos), para
// que se puedan probar solas (test/canchas.test.js).
//
// Modelo: una cancha con dos mitades, A y B.
//  - Cancha completa = ocupa A y B.
//  - Media cancha    = ocupa A o B (se asigna la que esté libre).
//  - Bloques de 1 hora que parten siempre en punto: 19:00, 20:00...
import {
  esFechaValida,
  minutosDeHora,
  horaDeMinutos,
  instante,
  ahoraChile,
  diaSemana,
  hoyChile,
  sumarDias,
} from "../reservasMesa/tiempo.js";

export const LADOS = ["A", "B"];
export const TIPOS = ["completa", "media"];
export const RE_HORA_EN_PUNTO = /^([01]\d|2[0-3]):00$/;

/** Horas que se pueden agendar un día (["19:00","20:00","21:00","22:00"]). */
export const horasDelDia = (config, fecha) => {
  if (!esFechaValida(fecha)) return [];
  const dia = diaSemana(fecha);
  const h = (config?.horario || []).find((x) => x.dia === dia && x.activo);
  if (!h || !RE_HORA_EN_PUNTO.test(h.desde) || !RE_HORA_EN_PUNTO.test(h.hasta)) return [];
  const desde = minutosDeHora(h.desde);
  const hasta = minutosDeHora(h.hasta);
  const horas = [];
  for (let m = desde; m <= hasta; m += 60) horas.push(horaDeMinutos(m));
  return horas;
};

export const diaCerrado = (config, fecha) =>
  (config?.diasCerrados || []).find((d) => d.fecha === fecha) || null;

/** Lados ocupados en una hora por las reservas activas de esa hora. */
export const ladosOcupados = (reservasDeLaHora = []) => {
  const ocupados = new Set();
  for (const r of reservasDeLaHora) {
    if (r.activa === false || r.estado === "cancelada") continue;
    for (const l of r.lados || []) ocupados.add(l);
  }
  return ocupados;
};

/** Qué se puede arrendar en una hora: { libres, completa, media }. */
export const estadoHora = (reservasDeLaHora, { permiteMedia = true } = {}) => {
  const ocupados = ladosOcupados(reservasDeLaHora);
  const libres = LADOS.filter((l) => !ocupados.has(l));
  return {
    libres,
    completa: libres.length === LADOS.length,
    media: permiteMedia && libres.length > 0,
  };
};

/** Lados que ocupará una reserva nueva, o null si no cabe. */
export const asignarLados = (tipo, libres, ladoPreferido = null) => {
  if (tipo === "completa") return libres.length === LADOS.length ? [...LADOS] : null;
  if (tipo === "media") {
    if (ladoPreferido && libres.includes(ladoPreferido)) return [ladoPreferido];
    return libres.length ? [libres[0]] : null;
  }
  return null;
};

export const precioDe = (config, tipo) =>
  tipo === "completa" ? Number(config?.precios?.completa) || 0 : Number(config?.precios?.media) || 0;

export const abonoDe = (config, precio) =>
  config?.abono?.activo ? Math.round((precio * (Number(config.abono.porcentaje) || 0)) / 100) : 0;

/**
 * ¿Se puede reservar esta fecha/hora? Devuelve un mensaje de error o null.
 * `panel: true` (personal del recinto) ignora el mínimo de anticipación y
 * el máximo de días, pero nunca permite horas pasadas ni fuera del horario.
 */
export const validarTurno = (config, fecha, hora, { ahora = new Date(), panel = false } = {}) => {
  if (!esFechaValida(fecha)) return "La fecha no es válida";
  if (!RE_HORA_EN_PUNTO.test(String(hora || ""))) return "Las horas parten siempre en punto (19:00, 20:00...)";
  const cerrado = diaCerrado(config, fecha);
  if (cerrado) return `Ese día el recinto está cerrado${cerrado.motivo ? `: ${cerrado.motivo}` : ""}`;
  if (!horasDelDia(config, fecha).includes(hora)) return "Esa hora no está dentro del horario de la cancha";

  const momento = instante(fecha, hora);
  const ahoraCl = ahoraChile(ahora);
  if (!momento.isAfter(ahoraCl)) return "Esa hora ya pasó";
  if (!panel) {
    const minimo = Number(config?.anticipacion?.minutosMinimo) || 0;
    if (momento.diff(ahoraCl, "minute") < minimo) {
      return `Se reserva con al menos ${minimo >= 60 ? `${Math.round(minimo / 60)} hora${minimo >= 120 ? "s" : ""}` : `${minimo} minutos`} de anticipación`;
    }
    const maxDias = Number(config?.anticipacion?.diasMaximo) || 30;
    if (fecha > sumarDias(hoyChile(ahora), maxDias)) return `Se puede reservar hasta ${maxDias} días antes`;
  }
  return null;
};

/** ¿El cliente todavía puede cancelar desde su link? */
export const puedeCancelarWeb = (config, reserva, ahora = new Date()) => {
  if (!config?.cancelacion?.permitidaWeb) return { ok: false, mensaje: "Para cancelar, comunícate con el recinto" };
  if (!["pendiente", "confirmada"].includes(reserva.estado)) {
    return { ok: false, mensaje: "Esta reserva ya no se puede cancelar" };
  }
  const horas = Number(config.cancelacion.horasMinimo) || 0;
  const faltan = instante(reserva.fecha, reserva.hora).diff(ahoraChile(ahora), "minute");
  if (faltan < horas * 60) {
    return { ok: false, mensaje: `Solo se puede cancelar hasta ${horas} horas antes. Comunícate con el recinto.` };
  }
  return { ok: true };
};

/* ─────────── Estados ─────────── */

export const TRANSICIONES = {
  pendiente: ["confirmada", "cancelada"],
  confirmada: ["completada", "no_asistio", "cancelada"],
  // Corrección: se marcó "no asistió" pero sí jugaron
  no_asistio: ["completada"],
  completada: [],
  cancelada: [],
};

export const puedeTransicionar = (desde, hacia) => (TRANSICIONES[desde] || []).includes(hacia);

/** Reservas que cuentan como arriendo del mes (las que se juegan o se jugaron). */
export const ESTADOS_ARRIENDO = ["confirmada", "completada"];

/* ─────────── Estadísticas ─────────── */

/** Medias canchas (horas-mitad) que se pueden vender en un mes. */
export const capacidadDelMes = (config, anio, mes) => {
  const primero = `${anio}-${String(mes + 1).padStart(2, "0")}-01`;
  let fecha = primero;
  let mitades = 0;
  while (fecha.slice(0, 7) === primero.slice(0, 7)) {
    if (!diaCerrado(config, fecha)) mitades += horasDelDia(config, fecha).length * LADOS.length;
    fecha = sumarDias(fecha, 1);
  }
  return mitades;
};

/** Resumen de un mes a partir de sus reservas (lean). */
export const resumenDelMes = (reservas, config, anio, mes) => {
  const arriendos = reservas.filter((r) => ESTADOS_ARRIENDO.includes(r.estado));
  const ingresos = arriendos.reduce((s, r) => s + (r.precio || 0), 0);
  const cobrado = arriendos.reduce((s, r) => s + Math.min(r.pago?.montoPagado || 0, r.precio || 0), 0);
  const mitadesVendidas = arriendos.reduce((s, r) => s + (r.lados?.length || 0), 0);
  const capacidad = capacidadDelMes(config, anio, mes);

  const porHora = {};
  const porDia = [0, 0, 0, 0, 0, 0, 0];
  const calor = {};
  const clientes = new Map();
  for (const r of arriendos) {
    porHora[r.hora] = (porHora[r.hora] || 0) + 1;
    const dia = diaSemana(r.fecha);
    porDia[dia] += 1;
    calor[`${dia} ${r.hora}`] = (calor[`${dia} ${r.hora}`] || 0) + 1;
    const clave = r.cliente?.telefonoNormalizado || r.cliente?.telefono || r.cliente?.nombre;
    const c = clientes.get(clave) || { nombre: r.equipo || r.cliente?.nombre, telefono: r.cliente?.telefono, arriendos: 0, total: 0 };
    c.arriendos += 1;
    c.total += r.precio || 0;
    clientes.set(clave, c);
  }

  return {
    arriendos: arriendos.length,
    completas: arriendos.filter((r) => r.tipo === "completa").length,
    medias: arriendos.filter((r) => r.tipo === "media").length,
    ingresos,
    cobrado,
    porCobrar: Math.max(0, ingresos - cobrado),
    pendientes: reservas.filter((r) => r.estado === "pendiente").length,
    canceladas: reservas.filter((r) => r.estado === "cancelada").length,
    noAsistio: reservas.filter((r) => r.estado === "no_asistio").length,
    ocupacion: capacidad ? Math.round((mitadesVendidas / capacidad) * 100) : 0,
    mitadesVendidas,
    capacidad,
    porHora: Object.entries(porHora)
      .map(([hora, cantidad]) => ({ hora, cantidad }))
      .sort((a, b) => a.hora.localeCompare(b.hora)),
    porDia: porDia.map((cantidad, dia) => ({ dia, cantidad })),
    // Arriendos por día de la semana y hora (mapa de calor)
    calor: Object.entries(calor).map(([k, cantidad]) => ({ dia: Number(k.split(" ")[0]), hora: k.split(" ")[1], cantidad })),
    clientesFrecuentes: [...clientes.values()].sort((a, b) => b.arriendos - a.arriendos).slice(0, 5),
  };
};

/* ─────────── Lista de espera ─────────── */

export const TIPOS_ESPERA = ["completa", "media", "cualquiera"];

/** ¿Lo que espera esta persona ya se puede reservar con el estado de la hora? */
export const esperaCabe = (tipo, estado) => {
  if (tipo === "completa") return estado.completa;
  if (tipo === "media") return estado.media;
  return estado.completa || estado.media;
};

/**
 * ¿Tiene sentido anotarse? Solo si lo que pide NO está disponible ahora
 * (si está libre, que reserve directamente).
 */
export const puedeAnotarseEnEspera = (tipo, estado) => !esperaCabe(tipo, estado);
