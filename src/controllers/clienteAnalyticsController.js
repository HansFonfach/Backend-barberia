import reservaModel from "../models/reserva.model.js";
import { calcularPromedioDias } from "../helpers/calcularPromedios.js";
import { generarMensajeEstado } from "../helpers/generarMensaje.js";

// Helpers de tipo de servicio
const esCorte = (nombre = "") =>
  nombre.toLowerCase().includes("pelo");

const esBarba = (nombre = "") =>
  nombre.toLowerCase().includes("barba");

// Normaliza fechas (evita problemas de zona horaria)
const normalizarFecha = fecha => {
  const f = new Date(fecha);
  f.setHours(0, 0, 0, 0);
  return f;
};

export const obtenerEstadoLookCliente = async (req, res) => {
  try {
    const userId = req.usuario.id;

    // Obtener TODAS las reservas del cliente
    const reservas = await reservaModel
      .find({ cliente: userId })
      .sort({ fecha: 1 }) // antiguo → reciente
      .populate("servicio", "nombre");

    // Sin historial
    if (!reservas.length) {
      return res.json({
        success: true,
        data: {
          corte: {
            promedio: 0,
            diasDesdeUltimo: null,
            mensaje:
              "Sin historial suficiente para calcular tu frecuencia de corte.",
          },
          barba: {
            promedio: 0,
            diasDesdeUltimo: null,
            mensaje:
              "Sin historial suficiente para calcular tu frecuencia de perfilado.",
          },
        },
      });
    }

    // Fecha actual normalizada
    const ahora = normalizarFecha(new Date());

    // 🔥 SOLO reservas PASADAS (las futuras NO cuentan)
    const reservasPasadas = reservas.filter(
      r => normalizarFecha(r.fecha) <= ahora
    );

    // Fechas por tipo de servicio (solo pasado)
    const fechasCorte = reservasPasadas
      .filter(r => esCorte(r.servicio?.nombre))
      .map(r => normalizarFecha(r.fecha))
      .sort((a, b) => a - b);

    const fechasBarba = reservasPasadas
      .filter(r => esBarba(r.servicio?.nombre))
      .map(r => normalizarFecha(r.fecha))
      .sort((a, b) => a - b);

    // Promedios
    const promedioCorte =
      fechasCorte.length > 1 ? calcularPromedioDias(fechasCorte) : 0;

    const promedioBarba =
      fechasBarba.length > 1 ? calcularPromedioDias(fechasBarba) : 0;

    // Últimas fechas reales (pasadas)
    const ultCorte =
      fechasCorte.length > 0
        ? fechasCorte[fechasCorte.length - 1]
        : null;

    const ultBarba =
      fechasBarba.length > 0
        ? fechasBarba[fechasBarba.length - 1]
        : null;

    // Días desde última reserva REAL
    const diasDesdeCorte = ultCorte
      ? Math.floor((ahora - ultCorte) / (1000 * 60 * 60 * 24))
      : null;

    const diasDesdeBarba = ultBarba
      ? Math.floor((ahora - ultBarba) / (1000 * 60 * 60 * 24))
      : null;

    // Mensajes personalizados
    const mensajeCorte =
      fechasCorte.length === 0
        ? "Primero debes reservar un corte para empezar a calcular."
        : fechasCorte.length === 1
          ? "Aún no hay suficiente historial para calcular tu frecuencia de corte."
          : generarMensajeEstado(diasDesdeCorte, promedioCorte, "corte");

    const mensajeBarba =
      fechasBarba.length === 0
        ? "Primero debes reservar un perfilado para empezar a calcular."
        : fechasBarba.length === 1
          ? "Aún no hay suficiente historial para calcular tu frecuencia de perfilado."
          : generarMensajeEstado(diasDesdeBarba, promedioBarba, "barba");

    return res.json({
      success: true,
      data: {
        corte: {
          promedio: promedioCorte,
          diasDesdeUltimo: diasDesdeCorte,
          mensaje: mensajeCorte,
        },
        barba: {
          promedio: promedioBarba,
          diasDesdeUltimo: diasDesdeBarba,
          mensaje: mensajeBarba,
        },
      },
    });
  } catch (error) {
    console.error("Error calculando estado del look:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};
