// migrar-colores-iniciales.js
//
// Deja guardado en empresa.colores el color que CADA negocio ya tiene hoy
// en su página (el que estaba hardcodeado en el código para su slug/rubro),
// para que:
//
//   1) No cambie nada visualmente ahora mismo (se guarda exactamente el
//      mismo color que ya se ve).
//   2) De ahí en adelante, cualquier negocio pueda entrar a
//      "Configuración → Colores" y modificarlo con confianza, en vez de
//      partir de un campo vacío que cae a un valor "de fábrica" oculto en
//      el código (eso fue justo lo que rompió a Lumica Beauty: un dato a
//      medias que nadie veía).
//
// Solo toca empresas que HOY NO tienen nada guardado en colores.primario.
// Si una empresa ya tiene un color propio configurado, se deja intacta —
// este script nunca pisa una personalización que el negocio ya hizo.
//
// Cómo usarlo (desde la carpeta BARBERIA BACK, con el .env ahí mismo):
//
//   node migrar-colores-iniciales.js --dry-run
//     Muestra qué le pondría a cada empresa, sin guardar nada todavía.
//
//   node migrar-colores-iniciales.js
//     Aplica los cambios de verdad.

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Empresa from "./src/models/empresa.model.js";

const dryRun = process.argv[2] === "--dry-run";

// Mismos valores que src/utils/temaEmpresa.js del frontend — el color que
// cada negocio ve HOY en su página pública si nunca ha tocado
// "Configuración → Colores".
const TEMA_DEFAULT = {
  primary: "#5e72e4",
  primaryLight: "#eaecfe",
  primaryDark: "#324cdd",
  secondary: "#2dce89",
  softBg: "#f6f9fc",
  heroBg: "linear-gradient(150deg, #172b4d 0%, #1a174d 100%)",
  textDark: "#172b4d",
  textMuted: "#8898aa",
  variant: "dark",
};

const TEMAS_LEGACY_POR_SLUG = {
  lumicabeauty: {
    primary: "#FF5DA1",
    primaryLight: "#FFE4F0",
    primaryDark: "#E64D8F",
    secondary: "#BA68C8",
    softBg: "#FFFFFF",
    heroBg: "linear-gradient(135deg, #FFFFFF 0%, #FFF5FA 100%)",
    textDark: "#2D3748",
    textMuted: "#718096",
    variant: "light",
  },
  "danails-studio": {
    primary: "#F2A7C3",
    primaryLight: "#FEF0F5",
    primaryDark: "#D4819F",
    secondary: "#D4AF37",
    softBg: "#FFF8FB",
    heroBg: "linear-gradient(135deg, #FFFFFF 0%, #FEF0F5 50%, #FFF8FB 100%)",
    textDark: "#3A2E32",
    textMuted: "#B09AA0",
    variant: "light",
  },
};

const TEMA_DEFAULT_GIMNASIO = {
  primary: "#2dce89",
  primaryLight: "#e3fcef",
  primaryDark: "#24a46d",
  secondary: "#11cdef",
  heroBg: "linear-gradient(150deg, #11142b 0%, #172b4d 55%, #0f2a22 100%)",
  softBg: "#f6fcf9",
  textDark: "#172b4d",
  textMuted: "#8898aa",
  variant: "dark",
};

// Misma prioridad que usan Landing.jsx / ReservaInvitado.jsx / etc: primero
// el tema hecho a mano por slug, si no, el de gimnasio según el rubro, si
// no, el genérico.
const obtenerTemaActual = (empresa) => {
  if (TEMAS_LEGACY_POR_SLUG[empresa.slug]) return TEMAS_LEGACY_POR_SLUG[empresa.slug];
  if (empresa.rubro === "gimnasio") return TEMA_DEFAULT_GIMNASIO;
  return TEMA_DEFAULT;
};

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`✅ Conectado a la base de datos${dryRun ? " (modo --dry-run, no se guarda nada)" : ""}\n`);

  const empresas = await Empresa.find({});
  console.log(`Revisando ${empresas.length} empresas...\n`);

  let migradas = 0;
  let saltadas = 0;

  for (const empresa of empresas) {
    if (empresa.colores?.primario) {
      console.log(`⏭️  ${empresa.nombre} (/${empresa.slug}) — ya tiene colores propios, no se toca.`);
      saltadas++;
      continue;
    }

    const tema = obtenerTemaActual(empresa);

    const nuevosColores = {
      primario: tema.primary,
      primarioLight: tema.primaryLight,
      primarioDark: tema.primaryDark,
      secundario: tema.secondary,
      fondo: "#FFFFFF",
      softBg: tema.softBg,
      texto: tema.textDark,
      textoMuted: tema.textMuted,
      heroBg: tema.heroBg,
      heroEsClaro: tema.variant === "light",
    };

    console.log(`🎨 ${empresa.nombre} (/${empresa.slug}) → primario: ${nuevosColores.primario}, heroEsClaro: ${nuevosColores.heroEsClaro}`);

    if (!dryRun) {
      empresa.colores = nuevosColores;
      await empresa.save();
    }

    migradas++;
  }

  console.log("\n" + "=".repeat(70));
  console.log(
    `${dryRun ? "Se migrarían" : "Migradas"}: ${migradas}  ·  Ya tenían colores propios (sin tocar): ${saltadas}`,
  );
  if (dryRun) {
    console.log("\nEsto fue solo una vista previa. Corre sin --dry-run para aplicar de verdad:");
    console.log("  node migrar-colores-iniciales.js");
  }

  await mongoose.disconnect();
  process.exit(0);
};

main().catch((err) => {
  console.error("❌ Error inesperado:", err);
  process.exit(1);
});
