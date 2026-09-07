// fix-rubro-empresa.js
//
// Arregla empresas a las que les falta el campo "rubro" (hoy obligatorio en
// el esquema de Empresa), pero SÍ tienen el campo viejo "tipo" (que existía
// antes y usa casi los mismos valores) — probablemente porque se crearon
// con una versión anterior del formulario de alta, que guardaba "tipo" en
// vez de "rubro", y nunca se migraron cuando "rubro" pasó a ser requerido.
// Mongoose valida el documento COMPLETO al guardar (no solo lo que
// cambia), así que mientras "rubro" siga vacío, CUALQUIER acción sobre esa
// empresa (registrar un pago, cambiar su estado, etc.) va a fallar.
//
// Dos modos:
//
//   node fix-rubro-empresa.js --auto
//     Revisa TODAS las empresas. A las que les falte "rubro" pero tengan un
//     "tipo" válido, les copia tipo → rubro y guarda. A las que no tengan
//     "tipo" tampoco (o tengan un valor que no es válido para "rubro"), las
//     deja intactas y te avisa para que las arregles a mano con el otro modo.
//
//   node fix-rubro-empresa.js <idEmpresa> <rubro>
//     Asigna manualmente el rubro indicado a una empresa puntual y guarda.
//     Útil para las que --auto no pudo resolver solo.
//     Ejemplo: node fix-rubro-empresa.js 698de476677550fcd3d2209c barberia
//
// (Los valores válidos de "rubro" están en el enum de src/models/empresa.model.js)

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Empresa from "./src/models/empresa.model.js";

const modo = process.argv[2];

if (!modo) {
  console.error("Uso: node fix-rubro-empresa.js --auto");
  console.error("     node fix-rubro-empresa.js <idEmpresa> <rubro>");
  process.exit(1);
}

const arreglarUna = async (empresa, rubroNuevo) => {
  console.log(`🏢 ${empresa.nombre} (/${empresa.slug})`);
  console.log(`   rubro actual: ${JSON.stringify(empresa.rubro)}  ·  tipo actual: ${JSON.stringify(empresa.tipo)}`);

  empresa.rubro = rubroNuevo;

  try {
    await empresa.save();
  } catch (error) {
    console.log(`   🚨 No se pudo guardar con rubro="${rubroNuevo}":`);
    if (error.errors) {
      Object.values(error.errors).forEach((e) => console.log(`      ❌ ${e.path}: ${e.message}`));
    } else {
      console.log(`      ${error.message}`);
    }
    return false;
  }

  console.log(`   ✅ rubro guardado como "${rubroNuevo}"`);
  return true;
};

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Conectado a la base de datos\n");

  if (modo === "--auto") {
    const empresas = await Empresa.find({});
    let arregladas = 0;
    let pendientes = [];

    for (const empresa of empresas) {
      // Si ya tiene un rubro válido, ni la tocamos.
      const errorActual = empresa.validateSync();
      const yaOk = !errorActual?.errors?.rubro;
      if (yaOk) continue;

      if (!empresa.tipo) {
        pendientes.push(`   - "${empresa.nombre}" (/${empresa.slug}, id: ${empresa._id}) — no tiene "tipo" tampoco, hay que asignarle el rubro a mano.`);
        continue;
      }

      const ok = await arreglarUna(empresa, empresa.tipo);
      if (ok) {
        arregladas++;
      } else {
        pendientes.push(`   - "${empresa.nombre}" (/${empresa.slug}, id: ${empresa._id}) — su "tipo" ("${empresa.tipo}") no es un rubro válido, hay que asignarle uno a mano.`);
      }
      console.log("");
    }

    console.log("=".repeat(70));
    console.log(`🎉 Arregladas automáticamente (copiando tipo → rubro): ${arregladas}`);
    if (pendientes.length) {
      console.log(`\n⚠️  Quedan ${pendientes.length} que necesitan que les digas el rubro a mano:`);
      pendientes.forEach((p) => console.log(p));
      console.log('\n   Para esas usa: node fix-rubro-empresa.js <id> <rubro>');
    }
  } else {
    const [idEmpresa, rubroNuevo] = process.argv.slice(2);
    if (!idEmpresa || !rubroNuevo) {
      console.error("Uso: node fix-rubro-empresa.js <idEmpresa> <rubro>");
      process.exit(1);
    }

    const empresa = await Empresa.findById(idEmpresa);
    if (!empresa) {
      console.log(`❌ No encontré ninguna empresa con id ${idEmpresa}`);
      await mongoose.disconnect();
      process.exit(1);
    }

    await arreglarUna(empresa, rubroNuevo);
  }

  await mongoose.disconnect();
  process.exit(0);
};

main().catch((err) => {
  console.error("❌ Error inesperado:", err);
  process.exit(1);
});
