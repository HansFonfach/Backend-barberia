// Lista de espera de reservas de mesa: quien no encontró lugar deja nombre y
// correo; cuando se libera lugar para su grupo ese día, se le avisa una vez.
//
// Se revisa (1) al tiro cuando algo libera lugar (una cancelación, un
// bloqueo que se quita) y (2) cada 15 minutos con el cron, por si el lugar
// se liberó de otra forma (más capacidad, una reserva editada...).
import ListaEsperaMesa from "../../models/listaEsperaMesa.model.js";
import ConfiguracionReservasMesa from "../../models/configuracionReservasMesa.model.js";
import Empresa from "../../models/empresa.model.js";
import { disponibilidadDelDia } from "./disponibilidad.js";
import { CANAL_WEB } from "./reglas.js";
import { hoyChile } from "./tiempo.js";
import { correoLugarDisponible } from "./correos.js";

/** Anota (o actualiza) a una persona en la lista de espera de un día. */
export const anotarEnListaEspera = async ({ empresaId, fecha, personas, nombre, email }) => {
  const filtro = { empresa: empresaId, fecha, email, estado: "esperando" };
  const datos = { $set: { nombre, personas } };
  try {
    return await ListaEsperaMesa.findOneAndUpdate(filtro, datos, { upsert: true, new: true });
  } catch (e) {
    if (e?.code === 11000) return ListaEsperaMesa.findOneAndUpdate(filtro, datos, { new: true });
    throw e;
  }
};

/** Horas en que hay lugar para `personas` ese día (canal web). */
const horasConLugar = async ({ empresaId, config, fecha, personas, ahora }) => {
  const horas = await disponibilidadDelDia({ empresaId, config, fecha, personas, canal: CANAL_WEB, ahora });
  return horas.filter((h) => h.sectores.some((s) => s.disponible)).map((h) => h.hora);
};

/**
 * Revisa la lista de espera de una empresa (todas sus fechas futuras, o solo
 * las indicadas) y avisa a quienes ya tienen lugar. Devuelve cuántos avisó.
 */
export const revisarListaEspera = async (empresaId, fechas = null, ahora = new Date()) => {
  const config = await ConfiguracionReservasMesa.findOne({ empresa: empresaId }).lean();
  if (!config?.listaEspera?.activa || !config.reservasWebActivas) return 0;

  const empresa = await Empresa.findById(empresaId)
    .select("nombre slug telefono direccion redes estado estadoSuscripcion modulos")
    .lean();
  if (!empresa?.modulos?.reservasMesas || empresa.estado === "inactivo") return 0;
  if (["suspendido", "cancelado"].includes(empresa.estadoSuscripcion)) return 0;

  const hoy = hoyChile(ahora);
  const esperando = await ListaEsperaMesa.find({
    empresa: empresaId,
    estado: "esperando",
    fecha: fechas?.length ? { $in: fechas.filter((f) => f >= hoy) } : { $gte: hoy },
  })
    .sort({ createdAt: 1 }) // los primeros en anotarse, primero
    .lean();

  const cache = new Map(); // "fecha|personas" → horas con lugar
  let avisados = 0;
  for (const ins of esperando) {
    const clave = `${ins.fecha}|${ins.personas}`;
    if (!cache.has(clave)) {
      cache.set(clave, await horasConLugar({ empresaId, config, fecha: ins.fecha, personas: ins.personas, ahora }));
    }
    const horas = cache.get(clave);
    if (!horas.length) continue;

    // Se marca antes de enviar: así dos revisiones a la vez no mandan dos correos
    const tomada = await ListaEsperaMesa.findOneAndUpdate(
      { _id: ins._id, estado: "esperando" },
      { $set: { estado: "avisado", avisadoEn: new Date() } },
      { new: true },
    );
    if (!tomada) continue;
    await correoLugarDisponible(tomada, empresa, horas.slice(0, 4));
    avisados += 1;
  }
  return avisados;
};

/** Para el cron: vence las fechas pasadas y revisa todas las empresas con gente esperando. */
export const revisarTodasLasListasEspera = async (ahora = new Date()) => {
  const hoy = hoyChile(ahora);
  await ListaEsperaMesa.updateMany({ estado: "esperando", fecha: { $lt: hoy } }, { $set: { estado: "vencido" } });
  const empresas = await ListaEsperaMesa.distinct("empresa", { estado: "esperando" });
  let total = 0;
  for (const empresaId of empresas) total += await revisarListaEspera(empresaId, null, ahora);
  return total;
};

/** Revisión sin hacer esperar la respuesta HTTP (tras una cancelación, por ejemplo). */
export const revisarListaEsperaEnSegundoPlano = (empresaId, fechas) => {
  Promise.resolve()
    .then(() => revisarListaEspera(empresaId, fechas))
    .catch((e) => console.error("❌ Lista de espera de mesas:", e.message));
};
