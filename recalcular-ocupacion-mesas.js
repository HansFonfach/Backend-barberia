// recalcular-ocupacion-mesas.js
//
// Herramienta de mantención: reconstruye los contadores de ocupación de las
// reservas de mesa de UNA empresa a partir de sus reservas activas. Solo hace
// falta si alguna vez se sospecha que un contador quedó desalineado (por
// ejemplo, el servidor se cayó justo a mitad de una reserva).
//
// Uso (desde BARBERIA BACK):  node recalcular-ocupacion-mesas.js santa-fe

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Empresa from "./src/models/empresa.model.js";
import { recalcularOcupacion } from "./src/services/reservasMesa/ocupacion.js";

const slug = process.argv[2];
if (!slug) {
  console.error("Uso: node recalcular-ocupacion-mesas.js <slug>");
  process.exit(1);
}

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const empresa = await Empresa.findOne({ slug: slug.toLowerCase() }).select("nombre").lean();
  if (!empresa) {
    console.error(`No existe una empresa con slug "${slug}".`);
    process.exit(1);
  }
  const r = await recalcularOcupacion(empresa._id);
  console.log(`✅ ${empresa.nombre}: ${r.reservas} reservas activas, ${r.contadores} contadores reconstruidos.`);
  await mongoose.disconnect();
  process.exit(0);
};

main().catch((e) => {
  console.error("Error inesperado:", e);
  process.exit(1);
});
