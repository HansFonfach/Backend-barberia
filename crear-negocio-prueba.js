// crear-negocio-prueba.js
//
// Crea un negocio con su usuario admin SIN pasar por el registro público
// (que manda la contraseña por correo). Útil para probar en localhost, donde
// no conviene depender del correo. Hace lo mismo que el registro: empresa en
// trial + usuario admin (rol "barbero", esAdmin). Si el rubro es
// "restaurante", deja activo el módulo de reservas de mesa.
//
// La contraseña se pasa por la línea de comandos: NO queda escrita en este
// archivo (así se puede subir a GitHub sin datos sensibles).
//
// Uso (desde BARBERIA BACK). Sin --aplicar solo muestra lo que haría:
//   node crear-negocio-prueba.js --nombre="Santa Fe" --slug=santafe --rubro=restaurante --correo=admin@santafe.cl --password=LaClave123
//   node crear-negocio-prueba.js ... --aplicar

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import Empresa from "./src/models/empresa.model.js";
import Usuario from "./src/models/usuario.model.js";

const opcion = (nombre) => {
  const a = process.argv.find((x) => x.startsWith(`--${nombre}=`));
  return a ? a.slice(nombre.length + 3).trim() : "";
};

const nombre = opcion("nombre");
const slug = opcion("slug").toLowerCase();
const rubro = opcion("rubro") || "restaurante";
const correo = opcion("correo").toLowerCase();
const password = opcion("password");
const telefono = opcion("telefono");
const aplicar = process.argv.includes("--aplicar");

const fallar = (msg) => {
  console.error(`❌ ${msg}`);
  process.exit(1);
};

if (!nombre) fallar('Falta --nombre="Nombre del negocio"');
if (!/^[a-z0-9-]{3,40}$/.test(slug)) fallar("--slug debe tener 3 a 40 letras minúsculas, números o guiones (ej: santafe)");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) fallar("--correo no es válido (es el usuario para entrar al panel)");
if (password.length < 8) fallar("--password debe tener al menos 8 caracteres");

const rubrosValidos = Empresa.schema.path("rubro").enumValues;
if (!rubrosValidos.includes(rubro)) fallar(`--rubro debe ser uno de: ${rubrosValidos.join(", ")}`);

const main = async () => {
  if (!process.env.MONGO_URI) fallar("No encontré MONGO_URI en el .env. Corre esto desde la carpeta BARBERIA BACK.");
  await mongoose.connect(process.env.MONGO_URI);

  if (await Empresa.exists({ slug })) {
    await mongoose.disconnect();
    fallar(`Ya existe una empresa con el slug "${slug}". Elige otro o usa esa.`);
  }

  console.log("Se va a crear:");
  console.log(`  Negocio:  ${nombre}  (/${slug})  rubro: ${rubro}`);
  console.log(`  Admin:    ${correo}`);
  if (rubro === "restaurante") console.log("  Módulo reservas de mesa: activo");

  if (!aplicar) {
    console.log("\nSIMULACIÓN: no se guardó nada. Agrega --aplicar para crearlo de verdad.");
    await mongoose.disconnect();
    return;
  }

  const empresa = await Empresa.create({
    nombre,
    slug,
    rubro,
    telefono: telefono || undefined,
    correo,
    rutEmpresa: "pendiente",
    trial: { activo: true, inicio: new Date(), fin: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    ...(rubro === "restaurante" ? { modulos: { reservasMesas: true } } : {}),
  });

  try {
    await Usuario.create({
      nombre,
      apellido: "",
      email: correo,
      telefono: telefono || undefined,
      password: await bcrypt.hash(password, 10),
      empresa: empresa._id,
      rol: "barbero",
      esAdmin: true,
    });
  } catch (e) {
    // Si el usuario no se pudo crear, no dejamos una empresa huérfana
    await Empresa.deleteOne({ _id: empresa._id });
    throw e;
  }

  console.log("\n✅ Creado.");
  console.log(`   Panel:   http://localhost:3000/${slug}/login   (usuario: ${correo})`);
  console.log(`   Público: http://localhost:3000/${slug}`);
  await mongoose.disconnect();
};

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Error inesperado:", e.message);
    process.exit(1);
  });
