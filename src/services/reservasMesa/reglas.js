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
  if (bloqueo) {
    return falta(
      "BLOQUEADO",
      bloqueo.motivo
        ? `No se reciben reservas en ese horario: ${bloqueo.motivo}`
        : "No se reciben reservas en ese horario",
    );
  }

  return resultado();
};
