import reservaModel from "../models/reserva.model.js";
import { calcularPromedioDias } from "../helpers/calcularPromedios.js";
import { generarMensajeEstado } from "../helpers/generarMensaje.js";

const esCorte = (nombre = "") => nombre.toLowerCase().includes("pelo");
const esBarba = (nombre = "") => nombre.toLowerCase().includes("barba");

export const obtenerEstadoLookCliente = async (req, res) => {
  try {
    const userId = req.usuario.id;

    // Obtener reservas del cliente y popular el nombre del servicio
    const reservas = await reservaModel
      .find({ cliente: userId })
      .sort({ fecha: 1 }) // Orden ascendente: más antiguo → más reciente
      .populate("servicio", "nombre");

    if (reservas.length === 0) {
      return res.json({
        success: true,
        data: {
          corte: {
            promedio: 0,
            diasDesdeUltimo: null,
            mensaje: "Sin historial suficiente para calcular tu frecuencia de corte.",
          },
          barba: {
            promedio: 0,
            diasDesdeUltimo: null,
            mensaje: "Sin historial suficiente para calcular tu frecuencia de perfilado.",
          },
        },
      });
    }

    // Separar y convertir fechas
    const fechasCorte = reservas
      .filter(r => esCorte(r.servicio?.nombre))
      .map(r => new Date(r.fecha));

    const fechasBarba = reservas
      .filter(r => esBarba(r.servicio?.nombre))
      .map(r => new Date(r.fecha));

    const ahora = new Date();

    // Calcular promedios (0 si hay solo 1 fecha)
    const promedioCorte =
      fechasCorte.length > 1 ? calcularPromedioDias(fechasCorte) : 0;
    const promedioBarba =
      fechasBarba.length > 1 ? calcularPromedioDias(fechasBarba) : 0;

    // Última fecha (más reciente)
    const ultCorte = fechasCorte.length ? fechasCorte[fechasCorte.length - 1] : null;
    const ultBarba = fechasBarba.length ? fechasBarba[fechasBarba.length - 1] : null;

    // Días desde última reserva
    const diasDesdeCorte = ultCorte
      ? Math.round((ahora - ultCorte) / (1000 * 60 * 60 * 24))
      : null;

    const diasDesdeBarba = ultBarba
      ? Math.round((ahora - ultBarba) / (1000 * 60 * 60 * 24))
      : null;

    // Generar mensajes personalizados
    const mensajeCorte = ultCorte
      ? generarMensajeEstado(diasDesdeCorte, promedioCorte, "corte")
      : "Primero debes reservar un corte para empezar a calcular.";

    const mensajeBarba = ultBarba
      ? generarMensajeEstado(diasDesdeBarba, promedioBarba, "barba")
      : "Primero debes reservar un perfilado para empezar a calcular.";

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
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};
