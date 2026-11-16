// marcar-destacados.js
//
// Marca los "Servicios destacados" de la página pública de un negocio
// (lo mismo que se puede hacer a mano en Gestión de Servicios → editar).
// Un * adelante = muy destacado (★ Recomendado). Busca los servicios por
// nombre aproximado (sin tildes, pestaña/pestañas, koreana/coreana).
//
//   node marcar-destacados.js lumicabeauty "diseño de cejas" "*lifting de pestaña" "lifting tecnica koreana" "laminado de cejas" "esmaltado permanente"
//     → muestra qué servicio encontró para cada nombre
//   ...lo mismo con --aplicar al final → los guarda (y quita el destacado a los demás)
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Empresa from "./src/models/empresa.model.js";
import Servicio from "./src/models/servicio.model.js";

const args = process.argv.slice(2);
const APLICAR = args.includes("--aplicar");
const [slug, ...nombres] = args.filter((a) => a !== "--aplicar");

if (!slug || !nombres.length) {
  console.error('Uso: node marcar-destacados.js <slug> "servicio 1" "*servicio muy destacado" ... [--aplicar]');
  process.exit(1);
}

const normalizar = (t) =>
  String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/kor/g, "cor")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p && !["de", "del", "la", "el", "y", "con"].includes(p));

// "pestana" también encuentra "pestanas", etc.
const calza = (palabra, palabrasServicio) =>
  palabrasServicio.some((p) => p === palabra || p.startsWith(palabra) || palabra.startsWith(p));

await mongoose.connect(process.env.MONGO_URI);

const empresa = await Empresa.findOne({ slug }, "_id nombre").lean();
if (!empresa) {
  console.error(`No existe un negocio con el slug "${slug}"`);
  process.exit(1);
}
const servicios = await Servicio.find({ empresa: empresa._id }, "nombre destacado activo").lean();
console.log(`${empresa.nombre}: ${servicios.length} servicios\n`);

// Los nombres más largos primero, para que "lifting de pestaña" no se quede
// con el "lifting técnica koreana".
const pedidos = nombres
  .map((n) => ({ texto: n.replace(/^\*/, ""), nivel: n.startsWith("*") ? "principal" : "destacado" }))
  .map((p) => ({ ...p, palabras: normalizar(p.texto) }))
  .sort((a, b) => b.palabras.length - a.palabras.length);

const usados = new Set();
const asignados = [];
for (const p of pedidos) {
  const candidatos = servicios
    .filter((s) => !usados.has(String(s._id)))
    .map((s) => ({ s, palabras: normalizar(s.nombre) }))
    .filter(({ palabras }) => p.palabras.every((w) => calza(w, palabras)))
    .sort((a, b) => a.palabras.length - b.palabras.length);
  const elegido = candidatos[0]?.s;
  if (elegido) {
    usados.add(String(elegido._id));
    asignados.push({ servicio: elegido, nivel: p.nivel });
  }
  console.log(
    `${p.nivel === "principal" ? "★" : "•"} "${p.texto}" → ${elegido ? `"${elegido.nombre}"` : "NO ENCONTRADO"}` +
      (candidatos.length > 1 ? `  (otros parecidos: ${candidatos.slice(1).map((c) => c.s.nombre).join(", ")})` : ""),
  );
}

const sinEncontrar = pedidos.length - asignados.length;
if (sinEncontrar) console.log(`\n⚠️  ${sinEncontrar} nombre(s) sin encontrar: revisa cómo se llaman en Gestión de Servicios.`);

if (APLICAR && asignados.length) {
  await Servicio.updateMany({ empresa: empresa._id }, { $set: { destacado: "" } });
  for (const { servicio, nivel } of asignados) {
    await Servicio.updateOne({ _id: servicio._id }, { $set: { destacado: nivel } });
  }
  console.log(`\n✅ ${asignados.length} servicio(s) destacados en ${empresa.nombre}.`);
} else if (asignados.length) {
  console.log("\nSi está bien, repite el mismo comando con --aplicar al final.");
}

await mongoose.disconnect();
