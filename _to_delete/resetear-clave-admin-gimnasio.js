// resetear-clave-admin-gimnasio.js
//
// Le pone una clave conocida al usuario admin del gimnasio (escobaredu4@gmail.com)
// para que puedas entrar sin depender de que el correo de bienvenida haya llegado.
//
// Cómo correrlo (desde la carpeta BARBERIA BACK, con el .env ahí mismo):
//   node resetear-clave-admin-gimnasio.js
//
// Después de entrar, cambia la clave desde la pantalla "Cambiar contraseña"
// del panel (ya existe en el sistema) por seguridad.

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import Usuario from "./src/models/usuario.model.js";
import Empresa from "./src/models/empresa.model.js";

const EMAIL_ADMIN = "escobaredu4@gmail.com";
const NUEVA_CLAVE = "Gimnasio2026!";

const main = async () => {
  if (!process.env.MONGO_URI) {
    console.error("❌ No encontré MONGO_URI en el .env. Corre este script desde la carpeta BARBERIA BACK.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Conectado a la base de datos");

  // Puede existir más de un Usuario con este correo (uno por empresa, ahora que
  // el correo/rut se valida por empresa y no globalmente). Filtramos por el
  // que es admin, que es el que se creó al registrar el negocio del gimnasio.
  const candidatos = await Usuario.find({ email: EMAIL_ADMIN, esAdmin: true }).populate(
    "empresa",
    "nombre slug rubro",
  );

  if (candidatos.length === 0) {
    console.error(`❌ No encontré ningún usuario admin con el correo ${EMAIL_ADMIN}.`);
    console.error("   ¿Ya se creó el negocio del gimnasio? Revisa si el registro terminó bien.");
    process.exit(1);
  }

  let admin = candidatos.find((u) => u.empresa?.rubro === "gimnasio");

  if (!admin && candidatos.length === 1) {
    admin = candidatos[0];
  }

  if (!admin) {
    console.log(`⚠️ Encontré ${candidatos.length} cuentas admin con ese correo, ninguna marcada como "gimnasio":`);
    candidatos.forEach((u, i) => {
      console.log(`   ${i + 1}. empresa: ${u.empresa?.nombre} (slug: ${u.empresa?.slug}, rubro: ${u.empresa?.rubro})`);
    });
    console.log("Ajusta el filtro en el script (por ejemplo por slug) y vuelve a correrlo.");
    process.exit(1);
  }

  admin.password = await bcrypt.hash(NUEVA_CLAVE, 10);
  await admin.save();

  console.log("\n🎉 Clave actualizada correctamente. Datos para entrar:");
  console.log(`   URL:     https://TU-FRONTEND/${admin.empresa.slug}/login`);
  console.log(`   Empresa: ${admin.empresa.nombre} (slug: ${admin.empresa.slug})`);
  console.log(`   Correo:  ${admin.email}`);
  console.log(`   Clave:   ${NUEVA_CLAVE}`);
  console.log("\n   Te recomiendo cambiarla apenas entres, desde la pantalla \"Cambiar contraseña\".");

  await mongoose.disconnect();
  process.exit(0);
};

main().catch((err) => {
  console.error("❌ Error inesperado:", err);
  process.exit(1);
});
