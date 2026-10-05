// registrar-cobro-empresa.js
//
// Registra en Mongo el cobro mensual PENDIENTE de un negocio (colección
// PagoEmpresa), que es lo que lee el cron de correos automáticos
// (pagoEmpresaCron.js) para avisar "vence en 5 días / 2 días / mañana / hoy".
//
// Por qué hace falta: el cron NO mira el "Próximo pago" del panel de
// super-admin, solo mira documentos PagoEmpresa en estado pendiente/atrasado.
// Si un negocio (como FocusTrain) no tiene uno cargado, el cron nunca le
// manda nada. Este script lo deja cargado, sin tocar ningún otro negocio.
//
// IMPORTANTE — lo que pasa una vez cargado el cobro (así funciona el cron):
//   · 5 días, 2 días y 1 día antes del vencimiento: correo de recordatorio
//   · el día del vencimiento: correo "tu plan vence hoy"
//   · 3 días DESPUÉS sin que registres el pago: correo de suspensión y el
//     negocio queda SUSPENDIDO automáticamente.
//   Cuando uses "Marcar pago" en el panel, este cobro se cierra solo como
//   pagado, así que no hay riesgo de suspender a alguien que ya pagó.
//
// El script no modifica nada hasta que lo corras SIN --dry-run, y siempre
// pide que el negocio buscado calce con exactamente 1 empresa.
//
// Cómo correrlo (desde la carpeta BARBERIA BACK, con el .env ahí mismo):
//
//   Ver qué haría, sin guardar nada:
//     node registrar-cobro-empresa.js focus --fecha=2026-10-05 --dry-run
//
//   Hacerlo de verdad:
//     node registrar-cobro-empresa.js focus --fecha=2026-10-05
//
//   Opciones:
//     <busqueda>        slug exacto o parte del nombre (ej: focus, focustrain)
//     --fecha=AAAA-MM-DD  día de vencimiento (si no la pasas, usa el "Próximo
//                         pago" que ya tenga la empresa en el panel)
//     --monto=NNNN       monto del cobro (si no lo pasas, usa la cuota mensual
//                         configurada en el panel)
//     --correo=a@b.cl    solo si la empresa NO tiene correo guardado: lo guarda
//                         (sin él no se le puede mandar ningún correo)
//     --dry-run          muestra lo que haría y no escribe nada

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

// ── Lectura simple de argumentos ──
const args = process.argv.slice(2);
const busqueda = args.find((a) => !a.startsWith("--"));
const opcion = (nombre) => {
  const a = args.find((x) => x.startsWith(`--${nombre}=`));
  return a ? a.slice(nombre.length + 3) : undefined;
};
const dryRun = args.includes("--dry-run");

if (!busqueda) {
  console.error("Uso: node registrar-cobro-empresa.js <slug o nombre> [--fecha=AAAA-MM-DD] [--monto=N] [--correo=a@b.cl] [--dry-run]");
  console.error("Ejemplo: node registrar-cobro-empresa.js focus --fecha=2026-10-05 --dry-run");
  process.exit(1);
}

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fmt = (d) => (d ? dayjs(d).tz(ZONA).format("DD-MM-YYYY") : "—");

const main = async () => {
  if (!process.env.MONGO_URI) {
    console.error("No encontré MONGO_URI en el .env. Corre esto desde la carpeta BARBERIA BACK.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Conectado a la base de datos\n");

  // ── 1. Encontrar el negocio (slug exacto primero, si no por nombre) ──
  let candidatas = await Empresa.find({ slug: busqueda.toLowerCase() });
  if (candidatas.length === 0) {
    candidatas = await Empresa.find({ nombre: new RegExp(escapar(busqueda), "i") });
  }

  if (candidatas.length === 0) {
    console.error(`No encontré ninguna empresa que calce con "${busqueda}".`);
    process.exit(1);
  }
  if (candidatas.length > 1) {
    console.error(`Encontré ${candidatas.length} empresas que calzan con "${busqueda}", necesito el slug exacto:`);
    candidatas.forEach((e) => console.error(` - ${e.nombre} (slug: ${e.slug})`));
    process.exit(1);
  }

  const empresa = candidatas[0];
  console.log(`Empresa: ${empresa.nombre} (slug: ${empresa.slug})`);
  console.log(`  correo guardado:  ${empresa.correo || "(ninguno)"}`);
  console.log(`  cuota mensual:    ${empresa.cuotaMensual || 0}`);
  console.log(`  próximo pago:     ${fmt(empresa.proximoPago)}`);
  console.log(`  estado de pago:   ${empresa.estadoSuscripcion}\n`);

  // ── 2. Fecha de vencimiento ──
  const fechaTxt = opcion("fecha");
  let fechaVencimiento;
  if (fechaTxt) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaTxt) || !dayjs(fechaTxt).isValid()) {
      console.error('La fecha tiene que venir como AAAA-MM-DD (ej: --fecha=2026-10-05).');
      process.exit(1);
    }
    // Mediodía de Chile, para que ningún cambio de zona horaria corra el día.
    fechaVencimiento = dayjs.tz(`${fechaTxt} 12:00`, "YYYY-MM-DD HH:mm", ZONA);
  } else if (empresa.proximoPago) {
    const f = dayjs(empresa.proximoPago).tz(ZONA).format("YYYY-MM-DD");
    fechaVencimiento = dayjs.tz(`${f} 12:00`, "YYYY-MM-DD HH:mm", ZONA);
  } else {
    console.error("Esta empresa no tiene \"Próximo pago\" en el panel. Pásame la fecha con --fecha=AAAA-MM-DD.");
    process.exit(1);
  }

  // ── 3. Monto ──
  const montoTxt = opcion("monto");
  const monto = montoTxt !== undefined ? Number(montoTxt) : empresa.cuotaMensual;
  if (!monto || Number.isNaN(monto) || monto <= 0) {
    console.error("No hay un monto válido. Pásalo con --monto=NNNN o configura la cuota mensual en el panel.");
    process.exit(1);
  }

  // ── 4. No duplicar: si ya hay un cobro pendiente para ese mismo día, no se crea otro ──
  const yaExiste = (
    await PagoEmpresa.find({
      empresa: empresa._id,
      estado: { $in: ["pendiente", "atrasado"] },
    })
  ).find(
    (p) =>
      dayjs(p.fechaVencimiento).tz(ZONA).format("YYYY-MM-DD") ===
      fechaVencimiento.format("YYYY-MM-DD"),
  );

  if (yaExiste) {
    console.log(
      `Ya existe un cobro ${yaExiste.estado} para el ${fmt(yaExiste.fechaVencimiento)} (id ${yaExiste._id}). No creo otro.`,
    );
    await mongoose.disconnect();
    process.exit(0);
  }

  // ── 5. Correo (sin correo no se le puede mandar ningún aviso) ──
  const correoNuevo = opcion("correo");
  const guardarCorreo = !empresa.correo && correoNuevo;
  if (!empresa.correo && !correoNuevo) {
    console.warn("⚠️  Esta empresa NO tiene correo guardado: el cobro se carga igual, pero los avisos");
    console.warn("   por correo no van a llegar a ningún lado. Puedes pasarlo con --correo=a@b.cl.\n");
  }

  console.log("Voy a crear este cobro pendiente:");
  console.log(`  vence el:  ${fechaVencimiento.format("DD-MM-YYYY")}`);
  console.log(`  monto:     $${Number(monto).toLocaleString("es-CL")}`);
  if (guardarCorreo) console.log(`  y guardar el correo ${correoNuevo} en la empresa`);

  if (dryRun) {
    console.log("\n(--dry-run) No guardé nada. Quita --dry-run para hacerlo de verdad.");
    await mongoose.disconnect();
    process.exit(0);
  }

  await PagoEmpresa.create({
    empresa: empresa._id,
    mes: fechaVencimiento.month() + 1,
    anio: fechaVencimiento.year(),
    monto,
    estado: "pendiente",
    fechaVencimiento: fechaVencimiento.toDate(),
    metodoPago: "transferencia",
    observacion: "Cobro cargado con registrar-cobro-empresa.js",
  });

  // updateOne (y no empresa.save()) a propósito: save() valida el documento
  // completo y puede fallar por datos viejos de la empresa que nada tienen
  // que ver con esto (ya te pasó con "Registrar pago").
  const cambios = {};
  if (guardarCorreo) cambios.correo = correoNuevo;
  if (!empresa.proximoPago) cambios.proximoPago = fechaVencimiento.toDate();
  if (!empresa.cuotaMensual) cambios.cuotaMensual = monto;
  if (Object.keys(cambios).length) {
    await Empresa.updateOne({ _id: empresa._id }, { $set: cambios });
  }

  console.log("\n✅ Listo. El cron de las 9:00 ya va a considerar este cobro.");
  console.log("   Hoy mismo, si necesitas avisar ya, usa el botón \"Avisar vence hoy\" del panel.");

  await mongoose.disconnect();
  process.exit(0);
};

main().catch((err) => {
  console.error("Error inesperado:", err);
  process.exit(1);
});
