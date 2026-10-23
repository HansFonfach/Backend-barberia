// Toma y libera cupo de forma atómica. Ver ocupacionFranjaMesa.model.js.
import OcupacionFranjaMesa from "../../models/ocupacionFranjaMesa.model.js";
import ReservaMesa from "../../models/reservaMesa.model.js";
import { ESTADOS_QUE_OCUPAN } from "./transiciones.js";

/** Crea los contadores que falten (en 0). Tolera que otra petición los cree a la vez. */
const asegurarContadores = async (empresa, sector, franjas) => {
  if (!franjas.length) return;
  try {
    await OcupacionFranjaMesa.bulkWrite(
      franjas.map((franja) => ({
        updateOne: {
          filter: { empresa, sector, franja },
          update: { $setOnInsert: { personas: 0 } },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  } catch (error) {
    // Dos upserts simultáneos del mismo contador: uno gana, el otro choca
    // con el índice único. El contador existe igual, que es lo que importa.
    const soloDuplicados =
      error?.code === 11000 ||
      (error?.writeErrors || []).every((e) => (e.code ?? e.err?.code) === 11000);
    if (!soloDuplicados) throw error;
  }
};

const devolver = (empresa, sector, franjas, personas) =>
  franjas.length
    ? OcupacionFranjaMesa.updateMany(
        { empresa, sector, franja: { $in: franjas } },
        { $inc: { personas: -personas } },
      )
    : null;

/**
 * Suma `personas` en cada franja solo si sigue habiendo lugar
 * (personas ocupadas + nuevas <= capacidad). Si una franja no alcanza, se
 * devuelve lo ya tomado y responde con la franja que falló.
 * Con `forzar` (sobrecupo autorizado) suma sin revisar capacidad.
 *
 * @returns {Promise<{ok:true} | {ok:false, franja:Date}>}
 */
export const tomarCupo = async ({ empresa, sector, franjas, personas, capacidad, forzar = false }) => {
  await asegurarContadores(empresa, sector, franjas);

  const tomadas = [];
  for (const franja of franjas) {
    const filtro = { empresa, sector, franja };
    if (!forzar) filtro.personas = { $lte: capacidad - personas };

    const actualizado = await OcupacionFranjaMesa.findOneAndUpdate(
      filtro,
      { $inc: { personas } },
      { new: true },
    );
    if (!actualizado) {
      await devolver(empresa, sector, tomadas, personas);
      return { ok: false, franja };
    }
    tomadas.push(franja);
  }
  return { ok: true };
};

/** Devuelve el cupo de una reserva. Nunca deja un contador bajo cero. */
export const liberarCupo = async ({ empresa, sector, franjas, personas }) => {
  if (!franjas?.length) return;
  await devolver(empresa, sector, franjas, personas);
  await OcupacionFranjaMesa.updateMany(
    { empresa, sector, franja: { $in: franjas }, personas: { $lt: 0 } },
    { $set: { personas: 0 } },
  );
};

/**
 * Reconstruye los contadores de una empresa desde sus reservas activas.
 * Herramienta de mantención (script recalcular-ocupacion-mesas.js): no se
 * usa en el flujo normal.
 */
export const recalcularOcupacion = async (empresa, { desde = new Date() } = {}) => {
  const reservas = await ReservaMesa.find({
    empresa,
    estado: { $in: ESTADOS_QUE_OCUPAN },
    ocupaCupo: true,
    fin: { $gt: desde },
  })
    .select("sector.id franjas personas")
    .lean();

  const totales = new Map();
  for (const r of reservas) {
    for (const f of r.franjas) {
      // Lo anterior a `desde` no se borró arriba, así que tampoco se vuelve a sumar
      if (new Date(f) < desde) continue;
      const k = `${r.sector.id}|${new Date(f).toISOString()}`;
      totales.set(k, (totales.get(k) || 0) + r.personas);
    }
  }

  await OcupacionFranjaMesa.deleteMany({ empresa, franja: { $gte: desde } });
  const docs = [...totales.entries()].map(([k, personas]) => {
    const [sector, iso] = k.split("|");
    return { empresa, sector, franja: new Date(iso), personas };
  });
  if (docs.length) await OcupacionFranjaMesa.insertMany(docs, { ordered: false });

  return { reservas: reservas.length, contadores: docs.length };
};
