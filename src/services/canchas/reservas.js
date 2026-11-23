// Operaciones con base de datos del módulo de canchas: configuración,
// disponibilidad de varios días y creación de reservas (web y panel).
import ConfiguracionCancha from "../../models/configuracionCancha.model.js";
import ReservaCancha from "../../models/reservaCancha.model.js";
import { instante, ahoraChile, sumarDias, hoyChile } from "../reservasMesa/tiempo.js";
import {
  generarCodigo,
  generarTokenCancelacion,
  normalizarTelefono,
  esTelefonoValido,
  esEmailValido,
  limpiarTexto,
} from "../reservasMesa/utilidades.js";
import {
  TIPOS,
  horasDelDia,
  diaCerrado,
  estadoHora,
  asignarLados,
  precioDe,
  abonoDe,
  validarTurno,
} from "./reglas.js";

export class ErrorCancha extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** Configuración del recinto; si no existe, la crea con los valores por defecto. */
export const obtenerConfig = async (empresaId) =>
  ConfiguracionCancha.findOneAndUpdate(
    { empresa: empresaId },
    { $setOnInsert: { empresa: empresaId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

export const reservasActivasEnRango = (empresaId, desde, hasta) =>
  ReservaCancha.find({ empresa: empresaId, activa: true, fecha: { $gte: desde, $lte: hasta } }).lean();

/**
 * Disponibilidad de `dias` días desde `desde`.
 * Con `detalle: true` (panel) incluye las reservas de cada hora.
 */
export const disponibilidad = (config, reservas, desde, dias, { ahora = new Date(), detalle = false } = {}) => {
  const porHora = new Map();
  for (const r of reservas) {
    const k = `${r.fecha} ${r.hora}`;
    if (!porHora.has(k)) porHora.set(k, []);
    porHora.get(k).push(r);
  }
  const ahoraCl = ahoraChile(ahora);
  const minimo = detalle ? 0 : Number(config.anticipacion?.minutosMinimo) || 0;
  const maxFecha = sumarDias(hoyChile(ahora), Number(config.anticipacion?.diasMaximo) || 30);

  const salida = [];
  for (let i = 0; i < dias; i++) {
    const fecha = sumarDias(desde, i);
    const cerrado = diaCerrado(config, fecha);
    const horas = cerrado ? [] : horasDelDia(config, fecha);
    salida.push({
      fecha,
      cerrado: !!cerrado || horas.length === 0,
      motivo: cerrado?.motivo || "",
      fueraDeRango: !detalle && fecha > maxFecha,
      horas: horas.map((hora) => {
        const delaHora = porHora.get(`${fecha} ${hora}`) || [];
        const estado = estadoHora(delaHora, { permiteMedia: config.permiteMedia });
        const pasada = instante(fecha, hora).diff(ahoraCl, "minute") < minimo;
        return {
          hora,
          ...estado,
          pasada,
          ...(detalle
            ? {
                reservas: delaHora.map((r) => ({
                  _id: r._id,
                  codigo: r.codigo,
                  fecha: r.fecha,
                  hora: r.hora,
                  inicio: r.inicio,
                  tipo: r.tipo,
                  lados: r.lados,
                  estado: r.estado,
                  cliente: r.cliente,
                  equipo: r.equipo,
                  precio: r.precio,
                  pago: r.pago,
                  abono: r.abono,
                  origen: r.origen,
                  serie: r.serie,
                  comentarios: r.comentarios,
                })),
              }
            : {}),
        };
      }),
    });
  }
  return salida;
};

/** Valida y normaliza los datos del cliente. */
export const datosCliente = (body, { exigirEmail = true } = {}) => {
  const nombre = limpiarTexto(body.nombre, 80);
  const telefono = limpiarTexto(body.telefono, 20);
  const email = limpiarTexto(body.email, 120).toLowerCase();
  if (nombre.length < 2) throw new ErrorCancha(400, "Indica tu nombre");
  if (!esTelefonoValido(telefono)) throw new ErrorCancha(400, "Indica un teléfono válido");
  if (exigirEmail && !esEmailValido(email)) throw new ErrorCancha(400, "Indica un correo válido para enviarte la confirmación");
  if (email && !esEmailValido(email)) throw new ErrorCancha(400, "El correo no es válido");
  return {
    nombre,
    telefono,
    telefonoNormalizado: normalizarTelefono(telefono),
    email,
  };
};

const codigoUnico = async (empresaId) => {
  for (let i = 0; i < 6; i++) {
    const codigo = generarCodigo(6);
    if (!(await ReservaCancha.exists({ empresa: empresaId, codigo }))) return codigo;
  }
  return generarCodigo(8);
};

/**
 * Crea una reserva. Lanza ErrorCancha con status y mensaje si no se puede.
 * opciones: { panel, actor, estado, ejemplo, serie, ahora, ladoPreferido }
 */
export const crearReservaCancha = async (empresa, config, body, opciones = {}) => {
  const { panel = false, actor = null, ahora = new Date() } = opciones;
  const fecha = String(body.fecha || "");
  const hora = String(body.hora || "");
  const tipo = String(body.tipo || "");

  if (!TIPOS.includes(tipo)) throw new ErrorCancha(400, "Elige cancha completa o media cancha");
  if (tipo === "media" && !config.permiteMedia) throw new ErrorCancha(400, "Este recinto no arrienda media cancha");
  const errorTurno = validarTurno(config, fecha, hora, { ahora, panel });
  if (errorTurno) throw new ErrorCancha(400, errorTurno);

  const cliente = datosCliente(body, { exigirEmail: !panel });
  if (!panel && config.reglas?.length && body.aceptaReglas !== true) {
    throw new ErrorCancha(400, "Debes aceptar las reglas del recinto");
  }

  // Límite de reservas futuras por teléfono (solo web)
  if (!panel) {
    const activas = await ReservaCancha.countDocuments({
      empresa: empresa._id,
      activa: true,
      "cliente.telefonoNormalizado": cliente.telefonoNormalizado,
      inicio: { $gte: ahora },
    });
    if (activas >= (config.maxReservasPorTelefono || 3)) {
      throw new ErrorCancha(409, `Ya tienes ${activas} reservas próximas. Para reservar más, comunícate con el recinto.`);
    }
  }

  const ocupadas = await ReservaCancha.find({ empresa: empresa._id, fecha, hora, activa: true }).select("lados estado activa").lean();
  const { libres } = estadoHora(ocupadas, { permiteMedia: config.permiteMedia });
  const lados = asignarLados(tipo, libres, opciones.ladoPreferido || body.lado || null);
  if (!lados) {
    throw new ErrorCancha(
      409,
      tipo === "completa" && libres.length
        ? "A esa hora ya hay media cancha arrendada: queda disponible solo la otra mitad"
        : "Esa hora ya está reservada",
      { libres },
    );
  }

  const precio = body.precio != null && panel ? Math.max(0, Math.round(Number(body.precio) || 0)) : precioDe(config, tipo);
  const montoAbono = abonoDe(config, precio);
  const estado =
    opciones.estado ||
    (panel ? "confirmada" : montoAbono > 0 || !config.confirmacionAutomatica ? "pendiente" : "confirmada");

  const token = panel && !cliente.email ? null : generarTokenCancelacion();
  try {
    const reserva = await ReservaCancha.create({
      empresa: empresa._id,
      codigo: await codigoUnico(empresa._id),
      fecha,
      hora,
      inicio: instante(fecha, hora).toDate(),
      tipo,
      lados,
      estado,
      activa: true,
      cliente,
      equipo: limpiarTexto(body.equipo, 60),
      comentarios: limpiarTexto(body.comentarios, 300),
      precio,
      abono: { requerido: montoAbono > 0 && !panel, monto: montoAbono },
      pago: opciones.pago || { estado: "pendiente", montoPagado: 0 },
      origen: panel ? "panel" : "web",
      serie: opciones.serie || undefined,
      aceptoReglas: body.aceptaReglas === true,
      ejemplo: !!opciones.ejemplo,
      tokenCancelacionHash: token?.hash || null,
      historial: [
        {
          usuario: actor?.id || null,
          nombreUsuario: actor?.nombre || "web",
          accion: "creada",
          detalle: `${tipo === "completa" ? "Cancha completa" : `Media cancha ${lados[0]}`} · ${estado}`,
        },
      ],
    });
    return { reserva: reserva.toObject(), token: token?.token || null };
  } catch (e) {
    if (e?.code === 11000) throw new ErrorCancha(409, "Alguien acaba de reservar esa hora. Elige otra, por favor.");
    throw e;
  }
};
