// Lista de espera de canchas ("avísame si se libera").
//  - anotarEnEspera: valida y guarda a la persona para una hora llena.
//  - revisarHora: cuando una hora se libera, avisa (correo + WhatsApp) a
//    todos los que esperaban algo que ahora cabe. El primero que reserva se
//    la queda; a cada uno se le avisa una sola vez.
//  - revisarEnSegundoPlano: lo mismo sin hacer esperar la respuesta.
//  - revisarTodas / vencerPasadas: red de seguridad del cron.
import Empresa from "../../models/empresa.model.js";
import ReservaCancha from "../../models/reservaCancha.model.js";
import ListaEsperaCancha from "../../models/listaEsperaCancha.model.js";
import { instante, ahoraChile } from "../reservasMesa/tiempo.js";
import { esTelefonoValido, esEmailValido, limpiarTexto, normalizarTelefono } from "../reservasMesa/utilidades.js";
import { TIPOS_ESPERA, estadoHora, esperaCabe, puedeAnotarseEnEspera, horasDelDia, diaCerrado } from "./reglas.js";
import { ErrorCancha, obtenerConfig } from "./reservas.js";
import { correoCanchaLiberada, whatsappCanchaLiberada } from "./notificaciones.js";

const MAX_ESPERAS_POR_TELEFONO = 5;
const CAMPOS_EMPRESA = "nombre slug telefono direccion correo logo estado estadoSuscripcion modulos";

const empresaActiva = (empresa) =>
  empresa?.modulos?.canchas && empresa.estado !== "inactivo" && !["suspendido", "cancelado"].includes(empresa.estadoSuscripcion);

const estadoDeLaHora = async (empresaId, fecha, hora, permiteMedia) => {
  const reservas = await ReservaCancha.find({ empresa: empresaId, fecha, hora, activa: true }).select("lados estado activa").lean();
  return estadoHora(reservas, { permiteMedia });
};

/** Anota a alguien para que le avisen si se libera una hora. */
export const anotarEnEspera = async (empresa, config, body, { ahora = new Date() } = {}) => {
  const fecha = String(body.fecha || "");
  const hora = String(body.hora || "");
  const tipo = TIPOS_ESPERA.includes(body.tipo) ? body.tipo : "cualquiera";
  if (tipo === "media" && !config.permiteMedia) throw new ErrorCancha(400, "Este recinto no arrienda media cancha");

  if (diaCerrado(config, fecha) || !horasDelDia(config, fecha).includes(hora)) {
    throw new ErrorCancha(400, "Esa hora no está dentro del horario de la cancha");
  }
  // Tiene que quedar tiempo para que alguien alcance a reservar
  if (instante(fecha, hora).diff(ahoraChile(ahora), "minute") < (Number(config.anticipacion?.minutosMinimo) || 0)) {
    throw new ErrorCancha(400, "Esa hora ya está muy cerca para anotarse en la lista de espera");
  }

  const nombre = limpiarTexto(body.nombre, 80);
  const telefono = limpiarTexto(body.telefono, 20);
  const email = limpiarTexto(body.email, 120).toLowerCase();
  if (nombre.length < 2) throw new ErrorCancha(400, "Indica tu nombre");
  if (!esTelefonoValido(telefono)) throw new ErrorCancha(400, "Indica un teléfono válido");
  if (!esEmailValido(email)) throw new ErrorCancha(400, "Indica un correo válido para avisarte");
  const telefonoNormalizado = normalizarTelefono(telefono);

  const estado = await estadoDeLaHora(empresa._id, fecha, hora, config.permiteMedia);
  if (!puedeAnotarseEnEspera(tipo, estado)) {
    throw new ErrorCancha(409, "¡Esa hora está disponible! Puedes reservarla ahora mismo.", { disponible: true });
  }

  const activas = await ListaEsperaCancha.countDocuments({
    empresa: empresa._id,
    estado: "esperando",
    "cliente.telefonoNormalizado": telefonoNormalizado,
    inicio: { $gt: ahora },
  });
  if (activas >= MAX_ESPERAS_POR_TELEFONO) {
    throw new ErrorCancha(409, `Ya estás esperando ${activas} horas. Espera el aviso de alguna antes de anotarte en otra.`);
  }

  try {
    const entrada = await ListaEsperaCancha.create({
      empresa: empresa._id,
      fecha,
      hora,
      inicio: instante(fecha, hora).toDate(),
      tipo,
      cliente: { nombre, telefono, telefonoNormalizado, email },
    });
    const enEspera = await ListaEsperaCancha.countDocuments({ empresa: empresa._id, fecha, hora, estado: "esperando" });
    return { entrada: entrada.toObject(), posicion: enEspera };
  } catch (e) {
    if (e?.code === 11000) throw new ErrorCancha(409, "Ya estás anotado para esa hora. Te avisaremos si se libera.");
    throw e;
  }
};

/**
 * Revisa una hora: si quedó algo libre, avisa a quienes lo esperaban.
 * Devuelve cuántos avisos se mandaron.
 */
export const revisarHora = async (empresaId, fecha, hora, { ahora = new Date(), empresa = null, config = null } = {}) => {
  const esperando = await ListaEsperaCancha.find({ empresa: empresaId, fecha, hora, estado: "esperando" }).sort({ createdAt: 1 }).lean();
  if (!esperando.length) return 0;

  // Hora ya pasada (o a punto de empezar): se vencen sin aviso
  if (new Date(esperando[0].inicio) <= ahora) {
    await ListaEsperaCancha.updateMany({ empresa: empresaId, fecha, hora, estado: "esperando" }, { $set: { estado: "vencida" } });
    return 0;
  }

  const emp = empresa || (await Empresa.findById(empresaId).select(CAMPOS_EMPRESA).lean());
  if (!empresaActiva(emp)) return 0;
  const cfg = config || (await obtenerConfig(empresaId));
  const estado = await estadoDeLaHora(empresaId, fecha, hora, cfg.permiteMedia);

  let avisos = 0;
  for (const e of esperando) {
    if (!esperaCabe(e.tipo, estado)) continue;
    // Se marca antes de mandar: así nunca se avisa dos veces
    const tomada = await ListaEsperaCancha.findOneAndUpdate(
      { _id: e._id, estado: "esperando" },
      { $set: { estado: "avisado", avisadoEn: new Date() } },
      { new: true },
    ).lean();
    if (!tomada) continue;
    await correoCanchaLiberada(tomada, emp, estado);
    const w = await whatsappCanchaLiberada(tomada, emp, estado);
    if (w && !w.ok) await ListaEsperaCancha.updateOne({ _id: tomada._id }, { $set: { error: String(w.error).slice(0, 200) } });
    avisos++;
  }
  return avisos;
};

/** Revisa varias horas sin hacer esperar la respuesta HTTP. pares = [{fecha, hora}] */
export const revisarEnSegundoPlano = (empresaId, pares = []) => {
  Promise.resolve()
    .then(async () => {
      const vistos = new Set();
      for (const { fecha, hora } of pares) {
        const k = `${fecha} ${hora}`;
        if (vistos.has(k)) continue;
        vistos.add(k);
        await revisarHora(empresaId, fecha, hora);
      }
    })
    .catch((e) => console.error("❌ Lista de espera de cancha:", e.message));
};

/** Cron: vence las esperas de horas que ya pasaron. */
export const vencerPasadas = async (ahora = new Date()) => {
  const r = await ListaEsperaCancha.updateMany({ estado: "esperando", inicio: { $lte: ahora } }, { $set: { estado: "vencida" } });
  return r.modifiedCount || 0;
};

/** Cron: revisa todas las horas con gente esperando (por si algo se liberó por otro camino). */
export const revisarTodas = async (ahora = new Date()) => {
  const grupos = await ListaEsperaCancha.aggregate([
    { $match: { estado: "esperando", inicio: { $gt: ahora } } },
    { $group: { _id: { empresa: "$empresa", fecha: "$fecha", hora: "$hora" } } },
  ]);
  let avisos = 0;
  for (const g of grupos) avisos += await revisarHora(g._id.empresa, g._id.fecha, g._id.hora, { ahora });
  return avisos;
};

/** Para el panel: quiénes esperan en un rango de fechas, agrupados por "fecha hora". */
export const esperandoEnRango = async (empresaId, desde, hasta) => {
  const filas = await ListaEsperaCancha.find({ empresa: empresaId, estado: "esperando", fecha: { $gte: desde, $lte: hasta } })
    .select("fecha hora tipo cliente createdAt")
    .sort({ createdAt: 1 })
    .lean();
  const mapa = {};
  for (const f of filas) {
    const k = `${f.fecha} ${f.hora}`;
    (mapa[k] = mapa[k] || []).push({ nombre: f.cliente.nombre, telefono: f.cliente.telefono, tipo: f.tipo });
  }
  return mapa;
};
