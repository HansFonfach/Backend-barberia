// resetear-colores-empresa.js
//
// Arregla un negocio cuya página se ve rota (texto invisible, colores
// mezclados) después de conectar "Configuración → Colores" a las páginas
// reales de cliente. La causa: algunas empresas ya tenían un
// empresa.colores parcialmente guardado en la base de datos desde antes
// (por ejemplo, de una prueba vieja del selector de colores), con algunos
// campos con valor y otros vacíos. Antes eso no se notaba porque ninguna
// página lo usaba — ahora sí, y una mezcla a medias (ej: colores.primario
// guardado pero colores.heroEsClaro nunca configurado) puede terminar en
// texto blanco sobre fondo casi blanco.
//
// Este script LIMPIA por completo el campo "colores" de una empresa
// puntual, dejándola exactamente como estaba antes de que existiera esta
// función: sin nada guardado, usando el tema por defecto que tenía
// hardcodeado en el código (el rosado de Lumica Beauty, el rosado de
// Danails Studio, o el azul genérico para cualquier otro negocio).
//
// Desde ahí, si quieres, puedes volver a configurar los colores desde
// "Configuración → Colores" del panel del negocio con calma, viendo la
// vista previa en tiempo real antes de guardar.
//
// Cómo usarlo (desde la carpeta BARBERIA BACK, con el .env ahí mismo):
//   node resetear-colores-empresa.js <slug>
//
// Ejemplo:
//   node resetear-colores-empresa.js lumicabeauty
//
// También puedes revisar TODAS las empresas primero, sin cambiar nada,
// para ver cuáles tienen algo guardado en "colores" (por si hay más
// negocios con el mismo problema sin que te hayan avisado todavía):
//   node resetear-colores-empresa.js --listar

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Empresa from "./src/models/empresa.model.js";

const arg = process.argv[2];

if (!arg) {
  console.error("Uso: node resetear-colores-empresa.js <slug>");
  console.error("     node resetear-colores-empresa.js --listar");
  process.exit(1);
}

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Conectado a la base de datos\n");

  if (arg === "--listar") {
    const empresas = await Empresa.find({});
    console.log(`Revisando ${empresas.length} empresas...\n`);

    let conColores = 0;
    for (const empresa of empresas) {
      if (empresa.colores?.primario) {
        conColores++;
        console.log(`🎨 "${empresa.nombre}" (/${empresa.slug})`);
        console.log(`   primario: ${empresa.colores.primario}`);
        console.log(`   heroEsClaro: ${JSON.stringify(empresa.colores.heroEsClaro)}`);
        console.log(`   secundario: ${empresa.colores.secundario || "(vacío)"}`);
        console.log(`   fondo: ${empresa.colores.fondo || "(vacío)"}`);
        console.log(`   texto: ${empresa.colores.texto || "(vacío)"}`);
        console.log("");
      }
    }

    console.log("=".repeat(70));
    console.log(
      conColores === 0
        ? "Ninguna empresa tiene colores guardados todavía."
        : `${conColores} empresa(s) tienen colores guardados — si alguna se ve mal, usa: node resetear-colores-empresa.js <slug>`,
    );
  } else {
    const slug = arg;
    const empresa = await Empresa.findOne({ slug });

    if (!empresa) {
      console.log(`❌ No encontré ninguna empresa con slug "${slug}"`);
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(`🏢 ${empresa.nombre} (/${empresa.slug})`);
    console.log(`   colores actuales: ${JSON.stringify(empresa.colores)}`);

    empresa.colores = undefined;
    empresa.markModified("colores");
    await empresa.save();

    console.log(`   ✅ Colores limpiados — vuelve a usar el tema por defecto de esta empresa.`);
  }

  await mongoose.disconnect();
  process.exit(0);
};

main().catch((err) => {
  console.error("❌ Error inesperado:", err);
  process.exit(1);
});
