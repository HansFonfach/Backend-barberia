// sincronizar-cobros.js
//
// Deja cargado en la colección PagoEmpresa el PRÓXIMO cobro de los negocios
// que ya pagaron y están al día. El cron de correos automáticos
// (pagoEmpresaCron.js) solo avisa de cobros que existan ahí; si un negocio
// pagó antes de que "Marcar pago" creara el cobro del mes siguiente, no tiene
// ninguno y nunca le llegaría el recordatorio.
//
// A qué negocios les crea el cobro: los que tengan
//   · estado "activo" (negocio habilitado),
//   · estadoSuscripcion "activo" (no trial, no suspendido, no cancelado),
//   · una cuota mensual mayor a 0,
//   · un "Próximo pago" de hoy en adelante,
//   · y ningún cobro pendiente/atrasado para ese mismo día.
// Con eso quedan fuera los de prueba (trial), los de cuota $0, los inactivos y
// los suspendidos. Todos los avisos del cobro nuevo parten en false.
//
// IMPORTANTE: corre PRIMERO cerrar-cobros-pagados.js (para cerrar los cobros
// viejos que ya pagaste) y recién después este.
//
// Por defecto es una SIMULACIÓN (no guarda nada). Para aplicarlo: --aplicar
//
// Cómo correrlo (desde la carpeta BARBERIA BACK, con el .env ahí mismo):
//
//   Ver qué haría:      node sincronizar-cobros.js
//   Aplicar de verdad:  node sincronizar-cobros.js --aplicar

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import Empresa from "./src/models/empresa.model.js";
import PagoEmpresa from "./src/models/pagoEmpresa.model.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const ZONA = "America/Santiago";
const fmt = (d) => (d ? dayjs(d).tz(ZONA).format("DD-MM-YYYY") : "—");

const main = async () => {
  const aplicar = process.argv.includes("--aplicar");

  if (!process.env.MONGO_URI) {
    console.error("No encontré MONGO_URI en el .env. Corre esto desde la carpeta BARBERIA BACK.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Conectado a la base de datos\n");

  const hoy = dayjs().tz(ZONA).startOf("day");
  const empresas = await Empresa.find({}).select(
    "nombre slug correo estado estadoSuscripcion cuotaMensual proximoPago",
  );

  let creados = 0;
  let yaTenian = 0;
  let omitidos = 0;

  for (const e of empresas) {
    const titulo = `🏢 ${e.nombre} (/${e.slug})`;

    // ── Filtros: quién NO entra y por qué ──
    let motivo = "";
    if (e.estado !== "activo") motivo = `negocio "${e.estado}"`;
    else if (e.estadoSuscripcion !== "activo") motivo = `suscripción "${e.estadoSuscripcion}"`;
    else if (!e.cuotaMensual || e.cuotaMensual <= 0) motivo = "sin cuota mensual";
    else if (!e.proximoPago) motivo = "sin próximo pago";
    else if (dayjs(e.proximoPago).tz(ZONA).startOf("day").isBefore(hoy))
      motivo = `próximo pago (${fmt(e.proximoPago)}) ya pasó, revísalo a mano`;

    if (motivo) {
      omitidos++;
      console.log(`${titulo}\n   ⏭️  se omite: ${motivo}\n`);
      continue;
    }

    const dia = dayjs(e.proximoPago).tz(ZONA).format("YYYY-MM-DD");
    const abiertos = await PagoEmpresa.find({
      empresa: e._id,
      estado: { $in: ["pendiente", "atrasado"] },
    });
    const existente = abiertos.find(
      (p) => dayjs(p.fechaVencimiento).tz(ZONA).format("YYYY-MM-DD") === dia,
    );

    if (existente) {
      yaTenian++;
      console.log(`${titulo}\n   ✔️  ya tiene cobro ${existente.estado} para el ${fmt(existente.fechaVencimiento)}, no hago nada\n`);
      continue;
    }

    const vence = dayjs.tz(`${dia} 12:00`, "YYYY-MM-DD HH:mm", ZONA);
    // Misma convención que tus cobros: mes = mes del vencimiento - 1 (enero → 12 del año anterior)
    const mes = vence.month() === 0 ? 12 : vence.month();
    const anio = vence.month() === 0 ? vence.year() - 1 : vence.year();

    creados++;
    console.log(
      `${titulo}\n   ➕ crear cobro pendiente: vence ${vence.format("DD-MM-YYYY")}, $${Number(e.cuotaMensual).toLocaleString("es-CL")}${e.correo ? "" : "  (⚠️ sin correo: los avisos no llegarían)"}\n`,
    );

    if (aplicar) {
      await PagoEmpresa.create({
        empresa: e._id,
        mes,
        anio,
        monto: e.cuotaMensual,
        estado: "pendiente",
        fechaVencimiento: vence.toDate(),
        metodoPago: "transferencia",
        observacion: "Cobro cargado con sincronizar-cobros.js",
        notificaciones: {
          diasAntes5: false,
          diasAntes2: false,
          diasAntes1: false,
          diaVencimiento: false,
          diasDespues3: false,
        },
      });
    }
  }

  console.log("=".repeat(60));
  if (aplicar) {
    console.log(`Listo: ${creados} cobro(s) creado(s), ${yaTenian} ya existían, ${omitidos} se omitieron.`);
  } else {
    console.log(`SIMULACIÓN: se crearían ${creados} cobro(s), ${yaTenian} ya existen, ${omitidos} se omitirían.`);
    console.log("No se guardó nada. Para aplicarlo de verdad: node sincronizar-cobros.js --aplicar");
  }

  await mongoose.disconnect();
  process.exit(0);
};

main().catch((err) => {
  console.error("Error inesperado:", err);
  process.exit(1);
});
