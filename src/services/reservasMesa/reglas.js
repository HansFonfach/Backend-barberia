// Reglas de negocio de una solicitud de reserva (sin base de datos).
// Todo lo que depende de la configuración del local se lee de `config`:
// acá no hay horarios, capacidades ni límites inventados.
import {
  esFechaValida,
  esHoraValida,
  minutosDeHora,
  horaDeMinutos,
  instante,
  ahoraChile,
  diaSemana,
  hoyChile,
  sumarDias,
  franjasEntre,
} from "./tiempo.js";

export const CANAL_PANEL = "panel";
export const CANAL_WEB = "web";

// Hasta cuántos días hacia adelante puede registrar el panel (eventos,
// fechas especiales). Es un tope técnico, no una regla del local: la
// anticipación máxima que define el local aplica a la web.
const MAX_DIAS_PANEL = 365;

const tieneValor = (v) => v !== null && v !== undefined && v !== "";

const diaAbiertoValido = (d) =>
  d?.abierto &&
  esHoraValida(d.desde) &&
  esHoraValida(d.hasta) &&
  minutosDeHora(d.hasta) >= minutosDeHora(d.desde);

/** Qué falta configurar para poder recibir reservas (vacío = listo). */
export const faltantesConfiguracion = (config, canal = CANAL_PANEL) => {
  if (!config) return ["Configuración de reservas"];
  const faltan = [];
  if (!(config.sectores || []).some((s) => s.activo && s.capacidad > 0)) {
    faltan.push("Al menos un sector activo con capacidad");
  }
  if (!(config.horario || []).some(diaAbiertoValido)) {
    faltan.push("Horario de llegadas de al menos un día");
  }
  if (!tieneValor(config.intervaloMinutos)) faltan.push("Intervalo de horas");
  if (!tieneValor(config.duracionMinutos)) faltan.push("Duración de la reserva");
  if (!tieneValor(config.anticipacionMinimaMinutos)) faltan.push("Anticipación mínima");
  if (!tieneValor(config.anticipacionMaximaDias)) faltan.push("Anticipación máxima");
  if (!tieneValor(config.maxPersonasPorReserva)) faltan.push("Máximo de personas por reserva");
  if (!tieneValor(config.toleranciaMinutos)) faltan.push("Tolerancia de atraso");
  if (canal === CANAL_WEB) {
    if (!config.reservasWebActivas) faltan.push("Reservas web activadas");
    if (!tieneValor(config.maxPersonasWeb)) faltan.push("Máximo de personas por reserva web");
  }
  return faltan;
};

/** Horas de llegada ("HH:mm") que se ofrecen un día, según horario e intervalo. */
export const horasDeLlegada = (config, fecha) => {
  if (!esFechaValida(fecha) || !config?.intervaloMinutos) return [];
  const dia = (config.horario || []).find((h) => h.dia === diaSemana(fecha));
  if (!diaAbiertoValido(dia)) return [];

  const horas = [];
  const fin = minutosDeHora(dia.hasta);
  for (let m = minutosDeHora(dia.desde); m <= fin; m += config.intervaloMinutos) {
    horas.push(horaDeMinutos(m));
  }
  return horas;
};

/** Primer bloqueo que impide reservar a esa hora en ese sector (o null). */
export const bloqueoQueAplica = (bloqueos, { fecha, hora, sectorId }) =>
  (bloqueos || []).find((b) => {
    if (b.fecha !== fecha) return false;
    if (b.sector && String(b.sector) !== String(sectorId)) return false;
    if (!b.horaDesde || !b.horaHasta) return true; // día completo
    return hora >= b.horaDesde && hora < b.horaHasta;
  }) || null;

/** "Hasta" de un tramo que dura hasta el cierre (ej: desde las 20:00 por orden de llegada). */
export const FIN_DEL_DIA = "23:59";

/** Tipo efectivo de un bloqueo (los antiguos no traen tipo). */
export const tipoBloqueo = (b) => (b?.tipo === "orden_llegada" ? "orden_llegada" : "sin_reservas");

const esDeTodoElLocal = (b) => !b.sector;
const esDiaCompleto = (b) => !b.horaDesde || !b.horaHasta;

const conMotivo = (motivo, texto) =>
  motivo ? `${motivo}: ${texto}.` : `${texto.charAt(0).toUpperCase()}${texto.slice(1)}.`;

/** Texto que ve el cliente cuando un bloqueo le impide reservar. */
export const mensajeBloqueo = (b) => {
  if (tipoBloqueo(b) === "orden_llegada") {
    return conMotivo(
      b.motivo,
      esDiaCompleto(b)
        ? "ese día atendemos solo por orden de llegada, sin reservas"
        : b.horaHasta === FIN_DEL_DIA
          ? `desde las ${b.horaDesde} atendemos solo por orden de llegada, sin reservas`
          : `entre las ${b.horaDesde} y las ${b.horaHasta} atendemos solo por orden de llegada, sin reservas`,
    );
  }
  return b.motivo
    ? `No se reciben reservas en ese horario: ${b.motivo}`
    : "No se reciben reservas en ese horario";
};

/** Texto para anunciar un día especial en la página pública. */
const mensajeDiaEspecial = (b) =>
  tipoBloqueo(b) === "orden_llegada"
    ? mensajeBloqueo(b)
    : conMotivo(b.motivo, "ese día no recibimos reservas");

/**
 * Bloqueos que se anuncian en la página pública: los de todo el local que
 * cierran el día completo o que lo dejan por orden de llegada. Los de un
 * sector (terraza con lluvia) no se anuncian: el cliente simplemente no ve
 * ese sector.
 */
export const diasEspecialesPublicos = (bloqueos) =>
  (bloqueos || [])
    .filter((b) => esDeTodoElLocal(b) && (esDiaCompleto(b) || tipoBloqueo(b) === "orden_llegada"))
    .map((b) => ({
      fecha: b.fecha,
      tipo: tipoBloqueo(b),
      diaCompleto: esDiaCompleto(b),
      horaDesde: esDiaCompleto(b) ? null : b.horaDesde,
      horaHasta: esDiaCompleto(b) ? null : b.horaHasta,
      motivo: b.motivo || "",
      mensaje: mensajeDiaEspecial(b),
    }))
    .sort((a, b) => (a.fecha + (a.horaDesde || "")).localeCompare(b.fecha + (b.horaDesde || "")));

const sectoresDelCanal = (config, canal) =>
  (config.sectores || []).filter(
    (s) => s.activo && s.capacidad > 0 && (canal !== CANAL_WEB || s.reservableOnline),
  );

export { sectoresDelCanal };

/**
 * Valida fecha, hora, personas y sector de una solicitud contra la
 * configuración. NO revisa capacidad (eso necesita la base).
 *
 * @returns {{ok:true, sector, inicio:Date, fin:Date, franjas:Date[]}
 *          | {ok:false, codigo:string, mensaje:string}}
 */
export const validarSolicitud = ({
  config,
  fecha,
  hora,
  personas,
  sectorId,
  canal = CANAL_PANEL,
  bloqueos = [],
  ahora = new Date(),
  // Al editar una reserva sin cambiar su fecha ni su hora (por ejemplo, llegó
  // una persona más), no se vuelve a exigir horario, anticipación ni
  // bloqueos: la hora ya fue válida al crearla y puede estar en curso.
  mantieneHorario = false,
}) => {
  const falta = (codigo, mensaje) => ({ ok: false, codigo, mensaje });

  const faltantes = faltantesConfiguracion(config, canal);
  if (faltantes.length) {
    return falta(
      "SIN_CONFIGURAR",
      canal === CANAL_WEB
        ? "Las reservas en línea no están disponibles por ahora."
        : `Falta configurar: ${faltantes.join(", ")}.`,
    );
  }

  if (!esFechaValida(fecha)) return falta("DATOS_INVALIDOS", "La fecha no es válida");
  if (!esHoraValida(hora)) return falta("DATOS_INVALIDOS", "La hora no es válida");

  const n = Number(personas);
  if (!Number.isInteger(n) || n < 1) {
    return falta("DATOS_INVALIDOS", "La cantidad de personas no es válida");
  }
  const maximo = canal === CANAL_WEB ? config.maxPersonasWeb : config.maxPersonasPorReserva;
  if (n > maximo) {
    return falta(
      "GRUPO_GRANDE",
      canal === CANAL_WEB
        ? `Para grupos de más de ${maximo} personas, contáctanos directamente.`
        : `El máximo por reserva es ${maximo} personas.`,
    );
  }

  const sector = sectoresDelCanal(config, canal).find(
    (s) => String(s._id) === String(sectorId),
  );
  if (!sector) return falta("SECTOR_INVALIDO", "El sector elegido no está disponible");
  if (n > sector.capacidad) {
    return falta(
      "SIN_CUPO",
      `${sector.nombre} admite como máximo ${sector.capacidad} personas reservadas a la vez.`,
    );
  }

  const resultado = () => {
    const ini = instante(fecha, hora);
    const fin = ini.add(config.duracionMinutos, "minute");
    return {
      ok: true,
      sector,
      personas: n,
      inicio: ini.toDate(),
      fin: fin.toDate(),
      franjas: franjasEntre(ini.toDate(), fin.toDate()),
    };
  };

  if (mantieneHorario) return resultado();

  const horas = horasDeLlegada(config, fecha);
  if (horas.length === 0) return falta("DIA_CERRADO", "Ese día no se reciben reservas");
  if (!horas.includes(hora)) {
    return falta(
      "HORA_FUERA_DE_HORARIO",
      `Ese día se reciben llegadas entre ${horas[0]} y ${horas[horas.length - 1]}, cada ${config.intervaloMinutos} minutos.`,
    );
  }

  const inicio = instante(fecha, hora);
  const ahoraCl = ahoraChile(ahora);

  if (canal === CANAL_WEB) {
    if (inicio.isBefore(ahoraCl.add(config.anticipacionMinimaMinutos, "minute"))) {
      return falta(
        "MUY_PRONTO",
        "Esa hora ya no se puede reservar en línea. Elige una más tarde o llámanos.",
      );
    }
    if (fecha > sumarDias(hoyChile(ahora), config.anticipacionMaximaDias)) {
      return falta(
        "MUY_LEJOS",
        `Se puede reservar con hasta ${config.anticipacionMaximaDias} días de anticipación.`,
      );
    }
  } else {
    // En el panel se puede registrar a quien llama y llega en minutos, pero
    // no una reserva que ya pasó (más allá de la tolerancia de atraso).
    if (inicio.isBefore(ahoraCl.subtract(config.toleranciaMinutos, "minute"))) {
      return falta("EN_PASADO", "Esa hora ya pasó");
    }
    if (fecha > sumarDias(hoyChile(ahora), MAX_DIAS_PANEL)) {
      return falta("MUY_LEJOS", "La fecha está demasiado lejos");
    }
  }

  const bloqueo = bloqueoQueAplica(bloqueos, { fecha, hora, sectorId: sector._id });
  if (bloqueo) return falta("BLOQUEADO", mensajeBloqueo(bloqueo));

  return resultado();
};
