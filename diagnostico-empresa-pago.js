// diagnostico-empresa-pago.js
//
// Diagnóstico puntual de por qué "Registrar pago" falla para una empresa
// específica en el panel de super-admin, mientras que para otras funciona.
// registrarPago() hace empresa.save() después de modificar el documento, y
// Mongoose valida TODO el documento al guardar (no solo lo que cambió) — si
// esta empresa tiene algún dato viejo que ya no cumple una validación
// actual del esquema (por ejemplo, un pago histórico sin "monto", o un
// "rubro" vacío o que ya no está en el enum vigente), el guardado falla con
// un error que el panel no te muestra en detalle (solo "Error al registrar
// el pago"), pero este script sí te lo va a mostrar completo.
//
// Este script NO modifica nada — solo lee el/los documento(s) y corre la
// validación de Mongoose en memoria (validateSync), sin guardar.
//
// Cómo correrlo (desde la carpeta BARBERIA BACK, con el .env ahí mismo):
//   node diagnostico-empresa-pago.js <idEmpresa>
//
// Ejemplo con la empresa del mensaje de error:
//   node diagnostico-empresa-pago.js 698de476677550fcd3d2209c
//
// También puedes revisar TODAS las empresas de una vez (por si otro negocio
// viejo tiene el mismo problema, antes de que te avisen ellos):
//   node diagnostico-empresa-pago.js --todas

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Empresa from "./src/models/empresa.model.js";

const arg = process.argv[2];

if (!arg) {
  console.error("Uso: node diagnostico-empresa-pago.js <idEmpresa>");
  console.error("     node diagnostico-empresa-pago.js --todas   (revisa todas las empresas)");
  process.exit(1);
}

// Revisa una empresa. Devuelve true si pasa la validación, false si no.
// verbose=true imprime todos los datos (modo un-solo-id); en modo --todas
// solo se imprime el detalle de las que fallan, para no llenar la pantalla.
const revisarUna = (empresa, verbose) => {
  if (verbose) {
    console.log(`🏢 ${empresa.nombre} (/${empresa.slug})`);
    console.log(`   rubro: ${empresa.rutEmpresa ? `${empresa.rubro} (rut: ${empresa.rutEmpresa})` : empresa.rubro}`);
    console.log(`   estado: ${empresa.estado}  ·  estadoSuscripcion: ${empresa.estadoSuscripcion}`);
    console.log(`   cuotaMensual: ${empresa.cuotaMensual}`);
    console.log(`   fechaPago: ${empresa.fechaPago}`);
    console.log(`   ultimoPago: ${empresa.ultimoPago}`);
    console.log(`   proximoPago: ${empresa.proximoPago}`);
    console.log(`   plan: ${empresa.plan}`);
    console.log(`   historialPagos (${empresa.historialPagos.length} registros):`);
    empresa.historialPagos.forEach((p, i) => {
      console.log(`     [${i}] fecha: ${p.fecha} · monto: ${JSON.stringify(p.monto)} · notas: "${p.notas}"`);
    });
  }

  // Simulamos EXACTAMENTE lo que hace registrarPago(): agregar un pago de
  // prueba y validar el documento completo, sin guardar de verdad.
  empresa.historialPagos.push({ fecha: new Date(), monto: 1000, notas: "(prueba de diagnóstico, no se guarda)" });
  empresa.ultimoPago = new Date();

  const errorValidacion = empresa.validateSync();

  if (verbose) console.log("\n" + "=".repeat(70));

  if (errorValidacion) {
    console.log(`🚨 "${empresa.nombre}" (/${empresa.slug}, id: ${empresa._id}) — no pasa la validación de Mongoose:`);
    Object.values(errorValidacion.errors).forEach((e) => {
      console.log(`   ❌ Campo "${e.path}": ${e.message} (valor actual: ${JSON.stringify(e.value)})`);
    });
    if (verbose) {
      console.log("\n   Esto es justo lo que hace que empresa.save() falle en registrarPago(), y por");
      console.log("   eso el panel muestra el error genérico \"Error al registrar el pago\".");
    }
    return false;
  }

  if (verbose) {
    console.log("✅ El documento pasa la validación sin problema.");
    console.log("   Si aun así falla en el panel, el error real puede estar en otro lado");
    console.log("   (por ejemplo, un índice de la base de datos, o un problema de conexión");
    console.log("   puntual) — en ese caso pásame el log exacto que imprime el servidor");
    console.log('   ("Error al registrar pago:", <esto>) en su consola/logs de producción.');
  }
  return true;
};

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Conectado a la base de datos\n");

  if (arg === "--todas") {
    const empresas = await Empresa.find({});
    console.log(`Revisando ${empresas.length} empresas...\n`);

    let fallas = 0;
    for (const empresa of empresas) {
      const ok = revisarUna(empresa, false);
      if (!ok) fallas++;
    }

    console.log("\n" + "=".repeat(70));
    console.log(
      fallas === 0
        ? "🎉 Todas las empresas pasan la validación — ninguna tiene este problema."
        : `⚠️  ${fallas} de ${empresas.length} empresa(s) tienen el mismo problema. Usa fix-rubro-empresa.js (u otro fix según el campo) para cada una.`,
    );
  } else {
    const empresa = await Empresa.findById(arg);
    if (!empresa) {
      console.log(`❌ No encontré ninguna empresa con id ${arg}`);
      await mongoose.disconnect();
      process.exit(1);
    }
    revisarUna(empresa, true);
  }

  await mongoose.disconnect();
  process.exit(0);
};

main().catch((err) => {
  console.error("❌ Error inesperado:", err);
  process.exit(1);
});
