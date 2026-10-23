// Cálculo de cupo libre por hora y sector. La parte pura
// (`calcularDisponibilidad`, `buscarAlternativas`) no toca la base y se
// prueba aparte; `disponibilidadDelDia` carga lo necesario y la llama.
import OcupacionFranjaMesa from "../../models/ocupacionFranjaMesa.model.js";
import BloqueoReservaMesa from "../../models/bloqueoReservaMesa.model.js";
import {
  instante,
  franjasEntre,
  ahoraChile,
  minutosDeHora,
} from "./tiempo.js";
import {
  CANAL_PANEL,
  CANAL_WEB,
  horasDeLlegada,
  bloqueoQueAplica,
  sectoresDelCanal,
  faltantesConfiguracion,
} from "./reglas.js";

const clave = (sectorId, franja) => `${sectorId}|${new Date(franja).toISOString()}`;

/** Cupo libre de un sector en un conjunto de franjas (el peor caso manda). */
export const cupoLibre = ({ capacidad, sectorId, franjas, ocupacion, descontar }) => {
  let peor = 0;
  for (const f of franjas) {
    let ocupadas = ocupacion.get(clave(sectorId, f)) || 0;
    if (
      descontar &&
      String(descontar.sectorId) === String(sectorId) &&
      descontar.franjas.some((d) => new Date(d).getTime() === new Date(f).getTime())
    ) {
      ocupadas -= descontar.personas;
    }
    if (ocupadas > peor) peor = ocupadas;
  }
  return capacidad - peor;
};

/**
 * Disponibilidad de un día: por cada hora de llegada ofrecida, el cupo libre
 * de cada sector y si alcanza para `personas`.
 *
 * `descontar` = { sectorId, franjas, personas } de una reserva que se está
 * editando, para que no choque consigo misma.
 */
export const calcularDisponibilidad = ({
  config,
  fecha,
  personas = 1,
  canal = CANAL_PANEL,
  bloqueos = [],
  ocupacion = new Map(),
  descontar = null,
  ahora = new Date(),
}) => {
  const sectores = sectoresDelCanal(config, canal);
  const ahoraCl = ahoraChile(ahora);
  const limite =
    canal === CANAL_WEB
      ? ahoraCl.add(config.anticipacionMinimaMinutos || 0, "minute")
      : ahoraCl.subtract(config.toleranciaMinutos || 0, "minute");

  return horasDeLlegada(config, fecha)
    .filter((hora) => !instante(fecha, hora).isBefore(limite))
    .map((hora) => {
      const inicio = instante(fecha, hora);
      const franjas = franjasEntre(
        inicio.toDate(),
        inicio.add(config.duracionMinutos, "minute").toDate(),
      );
      return {
        hora,
        sectores: sectores.map((s) => {
          const bloqueo = bloqueoQueAplica(bloqueos, { fecha, hora, sectorId: s._id });
          const libre = Math.max(
            0,
            cupoLibre({ capacidad: s.capacidad, sectorId: s._id, franjas, ocupacion, descontar }),
          );
          return {
            id: String(s._id),
            nombre: s.nombre,
            capacidad: s.capacidad,
            libre,
            bloqueado: !!bloqueo,
            motivoBloqueo: bloqueo?.motivo || "",
            disponible: !bloqueo && libre >= personas,
          };
        }),
      };
    });
};

/**
 * Alternativas cuando no hay lugar: la misma hora en otros sectores y, en el
 * mismo sector, las horas disponibles más cercanas.
 */
export const buscarAlternativas = (disponibilidad, { hora, sectorId }, maximo = 4) => {
  const alternativas = [];
  const fila = disponibilidad.find((d) => d.hora === hora);
  for (const s of fila?.sectores || []) {
    if (s.id !== String(sectorId) && s.disponible) {
      alternativas.push({ hora, sectorId: s.id, sector: s.nombre });
    }
  }
  const objetivo = minutosDeHora(hora);
  const cercanas = disponibilidad
    .filter((d) => d.hora !== hora)
    .map((d) => ({ d, s: d.sectores.find((x) => x.id === String(sectorId)) }))
    .filter(({ s }) => s?.disponible)
    .sort(
      (a, b) =>
        Math.abs(minutosDeHora(a.d.hora) - objetivo) -
        Math.abs(minutosDeHora(b.d.hora) - objetivo),
    );
  for (const { d, s } of cercanas) {
    alternativas.push({ hora: d.hora, sectorId: s.id, sector: s.nombre });
  }
  return alternativas.slice(0, maximo);
};

/** Contadores de ocupación de unos sectores en un rango de tiempo. */
export const cargarOcupacion = async (empresaId, sectorIds, desde, hasta) => {
  const filas = await OcupacionFranjaMesa.find({
    empresa: empresaId,
    sector: { $in: sectorIds },
    franja: { $gte: desde, $lt: hasta },
  }).lean();
  return new Map(filas.map((f) => [clave(f.sector, f.franja), f.personas]));
};

/** Carga bloqueos y ocupación de un día y calcula su disponibilidad. */
export const disponibilidadDelDia = async ({
  empresaId,
  config,
  fecha,
  personas,
  canal = CANAL_PANEL,
  descontar = null,
  ahora = new Date(),
}) => {
  if (faltantesConfiguracion(config, canal).length) return [];

  const horas = horasDeLlegada(config, fecha);
  if (horas.length === 0) return [];

  const desde = instante(fecha, horas[0]).toDate();
  const hasta = instante(fecha, horas[horas.length - 1])
    .add(config.duracionMinutos, "minute")
    .toDate();

  const sectorIds = sectoresDelCanal(config, canal).map((s) => s._id);
  const [ocupacion, bloqueos] = await Promise.all([
    cargarOcupacion(empresaId, sectorIds, desde, hasta),
    BloqueoReservaMesa.find({ empresa: empresaId, fecha }).lean(),
  ]);

  return calcularDisponibilidad({
    config,
    fecha,
    personas,
    canal,
    bloqueos,
    ocupacion,
    descontar,
    ahora,
  });
};
