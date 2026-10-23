// activar-reservas-mesas.js
//
// Activa el módulo "Reservas de mesas" para UNA empresa (por slug) y,
// opcionalmente, le cambia el rubro a "restaurante" (así el panel le muestra
// el menú de restaurante en vez del de barbería).
//
// Por defecto es una SIMULACIÓN. Para aplicar: --aplicar
//
// Cómo correrlo (desde la carpeta BARBERIA BACK, con el .env ahí mismo):
//   node activar-reservas-mesas.js santa-fe                 (ver qué haría)
//   node activar-reservas-mesas.js santa-fe --rubro --aplicar
//   node activar-reservas-mesas.js santa-fe --desactivar --aplicar
//
//   --rubro       además deja la empresa con rubro "restaurante"
//   --desactivar  apaga el módulo (no borra reservas ni configuración)

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Empresa from "./src/models/empresa.model.js";

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--"));
const aplicar = args.includes("--aplicar");
const cambiarRubro = args.includes("--rubro");
const desactivar = args.includes("--desactivar");

if (!slug) {
  console.error("Uso: node activar-reservas-mesas.js <slug> [--rubro] [--desactivar] [--aplicar]");
  process.exit(1);
}

const main = async () => {
  if (!process.env.MONGO_URI) {
    console.error("No encontré MONGO_URI en el .env. Corre esto desde la carpeta BARBERIA BACK.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);

  const empresa = await Empresa.findOne({ slug: slug.toLowerCase() }).select("nombre slug rubro modulos").lean();
  if (!empresa) {
    console.error(`No existe una empresa con slug "${slug}".`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const cambios = { "modulos.reservasMesas": !desactivar };
  if (cambiarRubro && !desactivar) cambios.rubro = "restaurante";

  console.log(`Empresa: ${empresa.nombre} (/${empresa.slug})`);
  console.log(`  rubro actual:            ${empresa.rubro}`);
  console.log(`  módulo reservas de mesa: ${empresa.modulos?.reservasMesas ? "activo" : "apagado"}`);
  console.log("Cambios:", cambios);

  if (!aplicar) {
    console.log("\nSIMULACIÓN: no se guardó nada. Agrega --aplicar para hacerlo de verdad.");
  } else {
    // updateOne (no save) para no depender de que el resto del documento valide
    await Empresa.updateOne({ _id: empresa._id }, { $set: cambios });
    console.log("\n✅ Listo. El admin del local debe entrar a Reservas de mesa → Configuración.");
  }

  await mongoose.disconnect();
  process.exit(0);
};

main().catch((e) => {
  console.error("Error inesperado:", e);
  process.exit(1);
});
