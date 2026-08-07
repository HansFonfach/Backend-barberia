import mongoose from "mongoose";
import Reserva from "../models/reserva.model.js";
import VentaDirecta from "../models/ventaDirecta.model.js";
import Cliente from "../models/usuario.model.js";

/* ────────────────────────────────────────────────
   Ajusta estos nombres a los de tus modelos reales.
   Son los únicos valores que dependen de tu esquema.
   ──────────────────────────────────────────────── */
const CAMPO_BARBERO_RESERVA = "barbero";
const CAMPO_BARBERO_VENTA = "barbero";
const CAMPO_TIPO_VENTA = "tipo";
const TIPO_PRODUCTO = "producto";
const TIPO_EXTRA = "extra";
const CAMPO_MONTO_VENTA = "total";
// Los mismos campos que ya sumas en calcularIngresoConSuscripciones
const CAMPOS_MONTO_RESERVA = ["montoPagado", "abono"];
// Cómo se distingue un profesional de un cliente normal en cliente.model.js
const FILTRO_PROFESIONALES = { rol: "barbero" };

const sumaMontoReserva = {
  $add: CAMPOS_MONTO_RESERVA.map((campo) => ({ $ifNull: [`$${campo}`, 0] })),
};

const idsIguales = (a, b) => String(a) === String(b);

/**
 * Ingresos del mes agrupados por profesional.
 * Las suscripciones quedan fuera a propósito: son ingreso de la empresa
 * y no se pueden atribuir a una persona.
 */
export const ingresosPorProfesional = async ({ empresa, desde, hasta }) => {
  const rangoFecha = { $gte: desde, $lte: hasta };
  const empresaId = new mongoose.Types.ObjectId(empresa);

  const [porReservas, porVentas, profesionales] = await Promise.all([
    Reserva.aggregate([
      {
        $match: {
          empresa: empresaId,
          estado: "completada",
          fecha: rangoFecha,
        },
      },
      {
        $group: {
          _id: `$${CAMPO_BARBERO_RESERVA}`,
          ingresoReservas: { $sum: sumaMontoReserva },
          cantidadReservas: { $sum: 1 },
        },
      },
    ]),

    VentaDirecta.aggregate([
      {
        $match: {
          empresa: empresaId,
          fecha: rangoFecha,
        },
      },
      {
        $group: {
          _id: `$${CAMPO_BARBERO_VENTA}`,
          ingresoProductos: {
            $sum: {
              $cond: [
                { $eq: [`$${CAMPO_TIPO_VENTA}`, TIPO_PRODUCTO] },
                { $ifNull: [`$${CAMPO_MONTO_VENTA}`, 0] },
                0,
              ],
            },
          },
          ingresoExtras: {
            $sum: {
              $cond: [
                { $eq: [`$${CAMPO_TIPO_VENTA}`, TIPO_EXTRA] },
                { $ifNull: [`$${CAMPO_MONTO_VENTA}`, 0] },
                0,
              ],
            },
          },
        },
      },
    ]),

    Cliente.find({ empresa, ...FILTRO_PROFESIONALES })
      .select("_id nombre nombreCompleto")
      .lean(),
  ]);

  return profesionales
    .map((prof) => {
      const reservas = porReservas.find((r) => idsIguales(r._id, prof._id));
      const ventas = porVentas.find((v) => idsIguales(v._id, prof._id));

      const ingresoReservas = reservas?.ingresoReservas || 0;
      const ingresoProductos = ventas?.ingresoProductos || 0;
      const ingresoExtras = ventas?.ingresoExtras || 0;

      return {
        barberoId: prof._id,
        nombre: prof.nombreCompleto || prof.nombre || "Sin nombre",
        ingresoReservas,
        ingresoProductos,
        ingresoExtras,
        cantidadReservas: reservas?.cantidadReservas || 0,
        total: ingresoReservas + ingresoProductos + ingresoExtras,
      };
    })
    .sort((a, b) => b.total - a.total);
};