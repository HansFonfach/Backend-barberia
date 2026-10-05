// cerrar-cobros-pagados.js
//
// Limpia los cobros viejos de la colección PagoEmpresa que quedaron en
// "pendiente" / "atrasado" aunque el negocio YA pagó y tú lo marcaste con
// "Marcar pago" en el panel. Pasaba porque, antes, "Marcar pago" solo
// actualizaba la empresa (historialPagos / ultimoPago / proximoPago) y no
// tocaba estos cobros.
//
// Cómo decide si un cobro ya está pagado: mira el historialPagos de la
// empresa y busca un pago registrado a partir de 10 días antes del
// vencimiento del cobro (o cualquier fecha posterior). Un pago salda UN solo
// cobro: si una empresa tiene dos cobros viejos y un solo pago, solo se
// cierra el más antiguo. Los cobros sin ningún pago que los respalde NO se
// tocan (son deudas reales).
//
// Por defecto es una SIMULACIÓN: solo muestra qué haría. Para aplicarlo de
// verdad hay que pasar --aplicar.
//
// Cómo correrlo (desde la carpeta BARBERIA BACK, con el .env ahí mismo):
//
//   Ver qué haría (no guarda nada):
//     node cerrar-cobros-pagados.js
//
//   Aplicar los cambios:
//     node cerrar-cobros-pagados.js --aplicar

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { pathToFileURL } from "url";
import PagoEmpresa from "./src/models/pagoEmpresa.model.js";
import "./src/models/empresa.model.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const ZONA = "America/Santiago";
const VENTANA_DIAS = 10; // un pago hecho hasta 10 días antes del vencimiento cuenta para ese cobro

const fmt = (d) => dayjs(d).tz(ZONA).format("DD-MM-YYYY");

/**
 * Asigna pagos a cobros: recorre los cobros del más antiguo al más nuevo y a
 * cada uno le da el primer pago aún no usado hecho desde (vencimiento - 10
 * días) en adelante. Devuelve [{ cobro, pago | null }].
 * Función pura (sin base de datos) para poder probarla aparte.
 */
export const asignarPagos = (cobros, historialPagos) => {
  const pagos = [...(historialPagos || [])]
    .filter((p) => p?.fecha)
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  const usados = new Set();

  return [...cobros]
    .sort((a, b) => new Date(a.fechaVencimiento) - new Date(b.fechaVencimiento))
    .map((cobro) => {
      const desde = dayjs(cobro.fechaVencimiento).subtract(VENTANA_DIAS, "day");
      const idx = pagos.findIndex(
        (p, i) => !usados.has(i) && !dayjs(p.fecha).isBefore(desde),
      );
      if (idx === -1) return { cobro, pago: null };
      usados.add(idx);
      return { cobro, pago: pagos[idx] };
    });
};

const main = async () => {
  const aplicar = process.argv.includes("--aplicar");

  if (!process.env.MONGO_URI) {
    console.error("No encontré MONGO_URI en el .env. Corre esto desde la carpeta BARBERIA BACK.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Conectado a la base de datos\n");

  const abiertos = await PagoEmpresa.find({
    estado: { $in: ["pendiente", "atrasado"] },
  }).populate("empresa", "nombre slug historialPagos");

  if (abiertos.length === 0) {
    console.log("No hay cobros pendientes ni atrasados. Nada que hacer.");
    await mongoose.disconnect();
    process.exit(0);
  }

  // Agrupar por empresa
  const porEmpresa = new Map();
  for (const cobro of abiertos) {
    if (!cobro.empresa) {
      console.log(`(cobro ${cobro._id} apunta a una empresa que ya no existe, lo salto)`);
      continue;
    }
    const k = String(cobro.empresa._id);
    if (!porEmpresa.has(k)) porEmpresa.set(k, { empresa: cobro.empresa, cobros: [] });
    porEmpresa.get(k).cobros.push(cobro);
  }

  let aCerrar = 0;
  let sinPago = 0;

  for (const { empresa, cobros } of porEmpresa.values()) {
    console.log(`🏢 ${empresa.nombre} (/${empresa.slug}) — ${(empresa.historialPagos || []).length} pago(s) registrado(s)`);

    for (const { cobro, pago } of asignarPagos(cobros, empresa.historialPagos)) {
      const detalle = `cobro de ${String(cobro.mes).padStart(2, "0")}/${cobro.anio}, vence ${fmt(cobro.fechaVencimiento)}, hoy "${cobro.estado}"`;

      if (!pago) {
        sinPago++;
        console.log(`   ⏳ ${detalle} → sin pago registrado que lo respalde, se deja como está`);
        continue;
      }

      aCerrar++;
      console.log(
        `   ✅ ${detalle} → se cierra como PAGADO (pago del ${fmt(pago.fecha)}, $${Number(pago.monto).toLocaleString("es-CL")})`,
      );

      if (aplicar) {
        cobro.estado = "pagado";
        cobro.fechaPago = pago.fecha;
        if (!cobro.monto) cobro.monto = pago.monto;
        await cobro.save();
      }
    }
    console.log("");
  }

  console.log("=".repeat(60));
  if (aplicar) {
    console.log(`Listo: ${aCerrar} cobro(s) cerrado(s) como pagado, ${sinPago} se dejaron sin tocar.`);
  } else {
    console.log(`SIMULACIÓN: se cerrarían ${aCerrar} cobro(s) y ${sinPago} quedarían sin tocar.`);
    console.log("No se guardó nada. Para aplicarlo de verdad: node cerrar-cobros-pagados.js --aplicar");
  }

  await mongoose.disconnect();
  process.exit(0);
};

// Solo corre main() si se ejecuta el archivo directamente (así se puede
// importar asignarPagos para probarla sin conectarse a la base).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("Error inesperado:", err);
    process.exit(1);
  });
}
