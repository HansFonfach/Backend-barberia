// activar-entrenamiento-personal.js
//
// Activa modulos.entrenamientoPersonal = true para la empresa personal de
// Hans ("Team Hans"). Solo toca ESA empresa puntual (busca por nombre y
// exige que haya exactamente 1 coincidencia antes de escribir nada) — no
// afecta a ningun otro negocio.
//
// Como correrlo (desde la carpeta BARBERIA BACK, con el .env ahi mismo):
//   node activar-entrenamiento-personal.js

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Empresa from "./src/models/empresa.model.js";

const NOMBRE_BUSCADO = /team hans/i;

const main = async () => {
  if (!process.env.MONGO_URI) {
    console.error("No encontre MONGO_URI en el .env. Corre esto desde la carpeta BARBERIA BACK.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Conectado a la base de datos");

  const candidatas = await Empresa.find({ nombre: NOMBRE_BUSCADO });

  if (candidatas.length === 0) {
    console.error('No encontre ninguna empresa con nombre que contenga "Team Hans".');
    process.exit(1);
  }
  if (candidatas.length > 1) {
    console.error(`Encontre ${candidatas.length} empresas que calzan, necesito el slug exacto:`);
    candidatas.forEach((e) => console.error(` - ${e.nombre} (slug: ${e.slug}, rubro: ${e.rubro})`));
    process.exit(1);
  }

  const empresa = candidatas[0];
  console.log(`Empresa encontrada: ${empresa.nombre} (slug: ${empresa.slug}, rubro: ${empresa.rubro})`);
  console.log(`Estado actual de modulos.entrenamientoPersonal: ${empresa.modulos?.entrenamientoPersonal}`);

  empresa.modulos.entrenamientoPersonal = true;
  await empresa.save();

  console.log("Listo: modulos.entrenamientoPersonal = true para esta empresa.");

  await mongoose.disconnect();
  process.exit(0);
};

main().catch((err) => {
  console.error("Error inesperado:", err);
  process.exit(1);
});
