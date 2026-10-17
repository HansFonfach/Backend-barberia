import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import CodigoDescuento from "../models/codigoDescuento.model.js";
import Reserva from "../models/reserva.model.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const ZONA = "America/Santiago";

// Estados de reserva que NO consumen un cupo del código. "reagendada" es la
// reserva original que quedó reemplazada por la nueva (que sí cuenta).
export const ESTADOS_QUE_NO_CUENTAN = ["cancelada", "reagendada"];

export const normalizarCodigo = (c) =>
  String(c || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

const diaChile = (d) => dayjs(d).tz(ZONA).format("YYYY-MM-DD");

export const contarUsosCodigo = (codigoId, clienteId = null) => {
  const filtro = {
    "codigoDescuento.codigoId": codigoId,
    estado: { $nin: ESTADOS_QUE_NO_CUENTAN },
  };
  if (clienteId) filtro.cliente = clienteId;
  return Reserva.countDocuments(filtro);
};

/**
 * Estado "para mostrar" de un código: vigente | pausado | programado |
 * vencido | agotado. `usos` = reservas que ya lo usaron.
 */
export const estadoVigenciaCodigo = (codigo, usos = 0) => {
  if (!codigo.activo) return "pausado";
  const hoy = diaChile(new Date());
  if (codigo.fechaInicio && hoy < diaChile(codigo.fechaInicio)) return "programado";
  if (codigo.fechaFin && hoy > diaChile(codigo.fechaFin)) return "vencido";
  if (codigo.cupos != null && usos >= codigo.cupos) return "agotado";
  return "vigente";
};

/** Cuánto se descuenta de un precio. Nunca más que el precio. */
export const calcularDescuentoCodigo = (codigo, precioBase) => {
  const bruto =
    codigo.tipo === "porcentaje"
      ? Math.round((precioBase * codigo.valor) / 100)
      : Number(codigo.valor);
  return Math.max(0, Math.min(bruto, precioBase));
};

/**
 * Decide si un código se puede aplicar a un servicio y calcula el precio.
 *
 * @param {object} p
 * @param {string} p.empresaId
 * @param {string} p.codigo        lo que escribió el cliente
 * @param {string} p.servicioId
 * @param {number} p.precioBase    precio que se cobraría hoy sin el código
 * @param {number} p.precioLista   precio normal del servicio (para detectar promos)
 * @param {string} [p.clienteId]   para el límite por cliente
 * @returns {Promise<{ok:true, codigoDoc, descuento, precioOriginal, precioFinal} | {ok:false, message}>}
 */
export const evaluarCodigoDescuento = async ({
  empresaId,
  codigo,
  servicioId,
  precioBase,
  precioLista,
  clienteId = null,
}) => {
  const normalizado = normalizarCodigo(codigo);
  if (!normalizado) return { ok: false, message: "Ingresa un código" };

  const codigoDoc = await CodigoDescuento.findOne({
    empresa: empresaId,
    codigo: normalizado,
  });
  if (!codigoDoc) return { ok: false, message: "El código no es válido" };

  if (!codigoDoc.activo) {
    return { ok: false, message: "Este código no está activo" };
  }

  const hoy = diaChile(new Date());
  if (codigoDoc.fechaInicio && hoy < diaChile(codigoDoc.fechaInicio)) {
    return { ok: false, message: "Este código todavía no está vigente" };
  }
  if (codigoDoc.fechaFin && hoy > diaChile(codigoDoc.fechaFin)) {
    return { ok: false, message: "Este código ya expiró" };
  }

  const aplicaAlServicio = (codigoDoc.servicios || []).some(
    (s) => String(s) === String(servicioId),
  );
  if (!aplicaAlServicio) {
    return { ok: false, message: "Este código no aplica para este servicio" };
  }

  // No se acumula con una promoción que el servicio ya tiene (descuento
  // automático o precio especial más barato): se cobraría doble rebaja.
  if (
    Number(precioLista) > 0 &&
    Number(precioBase) > 0 &&
    Number(precioBase) < Number(precioLista)
  ) {
    return {
      ok: false,
      message:
        "Este servicio ya tiene una promoción activa, no se puede combinar con un código",
    };
  }

  if (!(Number(precioBase) > 0)) {
    return { ok: false, message: "Este código no aplica a este servicio" };
  }

  if (codigoDoc.cupos != null) {
    const usos = await contarUsosCodigo(codigoDoc._id);
    if (usos >= codigoDoc.cupos) {
      return { ok: false, message: "Este código ya alcanzó su límite de usos" };
    }
  }

  if (codigoDoc.maxUsosPorCliente != null && clienteId) {
    const usosCliente = await contarUsosCodigo(codigoDoc._id, clienteId);
    if (usosCliente >= codigoDoc.maxUsosPorCliente) {
      return {
        ok: false,
        message:
          codigoDoc.maxUsosPorCliente === 1
            ? "Ya usaste este código"
            : "Ya alcanzaste el máximo de usos de este código",
      };
    }
  }

  const descuento = calcularDescuentoCodigo(codigoDoc, Number(precioBase));
  return {
    ok: true,
    codigoDoc,
    descuento,
    precioOriginal: Number(precioBase),
    precioFinal: Number(precioBase) - descuento,
  };
};
