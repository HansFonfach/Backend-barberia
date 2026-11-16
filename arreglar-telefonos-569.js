// arreglar-telefonos-569.js
//
// Corrige los teléfonos guardados con el 9 repetido ("5699XXXXXXXX", 12
// dígitos) y los que quedaron incompletos ("9XXXXXXXX" u 8 dígitos), para que
// todos queden como 569XXXXXXXX y les lleguen los WhatsApp.
//
//   node arreglar-telefonos-569.js            → solo muestra lo que cambiaría
//   node arreglar-telefonos-569.js --aplicar  → guarda los cambios
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Usuario from "./src/models/usuario.model.js";
import { normalizarTelefonoCL } from "./src/utils/telefono.js";

const APLICAR = process.argv.includes("--aplicar");

await mongoose.connect(process.env.MONGO_URI);

const usuarios = await Usuario.find(
  { telefono: { $exists: true, $nin: [null, ""] } },
  "nombre apellido telefono empresa",
).lean();

const cambios = usuarios
  .map((u) => ({ u, nuevo: normalizarTelefonoCL(u.telefono) }))
  .filter(({ u, nuevo }) => nuevo && nuevo !== u.telefono && /^569\d{8}$/.test(nuevo));

for (const { u, nuevo } of cambios) {
  console.log(`${u.nombre} ${u.apellido || ""}`.trim().padEnd(30), u.telefono, "→", nuevo);
}
console.log(`\n${cambios.length} teléfono(s) para corregir de ${usuarios.length} revisados.`);

if (APLICAR && cambios.length) {
  await Usuario.bulkWrite(
    cambios.map(({ u, nuevo }) => ({ updateOne: { filter: { _id: u._id }, update: { $set: { telefono: nuevo } } } })),
  );
  console.log("✅ Corregidos.");
} else if (cambios.length) {
  console.log("Para guardarlos: node arreglar-telefonos-569.js --aplicar");
}

await mongoose.disconnect();
