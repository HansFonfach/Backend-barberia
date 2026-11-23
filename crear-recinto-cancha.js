// crear-recinto-cancha.js
//
// Crea un recinto deportivo (rubro "cancha") con el módulo de canchas activo,
// su usuario admin y la configuración inicial. Sirve para cualquier cliente
// nuevo de fútbol, y también para activar el módulo en una empresa que ya
// existe (--activar).
//
// Con --ejemplo agrega reservas de ejemplo (equipos inventados, marcadas
// "ejemplo") para mostrar el panel con datos. Se borran con --borrar-ejemplo.
// Las reservas de ejemplo no reciben recordatorios.
//
// La contraseña, el correo y el teléfono se pasan por la línea de comandos:
// NO quedan escritos en este archivo.
//
// Uso (desde BARBERIA BACK). Sin --aplicar solo muestra lo que haría:
//   node crear-recinto-cancha.js --nombre="Recinto Deportivo Huamalata" --slug=huamalata \
//        --correo=tu@correo.cl --password=LaClave123 --telefono=+56912345678 \
//        --ciudad=Ovalle --direccion="Calle 123" --ejemplo --aplicar
//
//   Activar en una empresa existente:   node crear-recinto-cancha.js --slug=huamalata --activar --aplicar
//   Rehacer los datos de ejemplo:        node crear-recinto-cancha.js --slug=huamalata --ejemplo --aplicar
//   Borrar los datos de ejemplo:         node crear-recinto-cancha.js --slug=huamalata --borrar-ejemplo --aplicar

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import Empresa from "./src/models/empresa.model.js";
import Usuario from "./src/models/usuario.model.js";
import ConfiguracionCancha from "./src/models/configuracionCancha.model.js";
import ReservaCancha from "./src/models/reservaCancha.model.js";
import { hoyChile, sumarDias, instante, ahoraChile } from "./src/services/reservasMesa/tiempo.js";
import { horasDelDia } from "./src/services/canchas/reglas.js";
import { generarCodigo } from "./src/services/reservasMesa/utilidades.js";

const opcion = (nombre) => {
  const a = process.argv.find((x) => x.startsWith(`--${nombre}=`));
  return a ? a.slice(nombre.length + 3).trim() : "";
};
const bandera = (nombre) => process.argv.includes(`--${nombre}`);

const nombre = opcion("nombre");
const slug = opcion("slug").toLowerCase();
const correo = opcion("correo").toLowerCase();
const password = opcion("password");
const telefono = opcion("telefono");
const ciudad = opcion("ciudad");
const direccion = opcion("direccion");
const diasPrueba = Math.max(1, parseInt(opcion("dias-prueba"), 10) || 30);
const aplicar = bandera("aplicar");
const activar = bandera("activar");
const ejemplo = bandera("ejemplo");
const borrarEjemplo = bandera("borrar-ejemplo");

const fallar = (msg) => {
  console.error(`❌ ${msg}`);
  process.exit(1);
};

if (!/^[a-z0-9-]{3,40}$/.test(slug)) fallar("--slug debe tener 3 a 40 letras minúsculas, números o guiones (ej: huamalata)");

/* ─────────── Reservas de ejemplo ─────────── */

const EQUIPOS = [
  ["Los Cracks del Martes", "Matías"],
  ["FC Oficina", "Felipe"],
  ["Atlético Pasaje", "Ignacio"],
  ["Deportivo Amigos", "Cristóbal"],
  ["Real Población", "Diego"],
  ["Los Veteranos", "Rodrigo"],
  ["Inter de Barrio", "Sebastián"],
  ["Club Pichanga", "Tomás"],
];

// Pseudoaleatorio con semilla: siempre arma lo mismo para el mismo slug
const azar = (semilla) => {
  let s = [...semilla].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const reservasDeEjemplo = (empresaId, config) => {
  const rnd = azar(slug);
  const hoy = hoyChile();
  const ahora = ahoraChile();
  const desde = `${hoy.slice(0, 7)}-01`;
  const hasta = sumarDias(hoy, 14);
  const salida = [];
  const usados = new Set();
  const codigo = () => {
    let c;
    do c = generarCodigo(6);
    while (usados.has(c));
    usados.add(c);
    return c;
  };

  for (let fecha = desde; fecha <= hasta; fecha = sumarDias(fecha, 1)) {
    for (const hora of horasDelDia(config, fecha)) {
      const pasada = !instante(fecha, hora).isAfter(ahora);
      // Más demanda a las 20:00 y 21:00
      const prob = { "19:00": 0.55, "20:00": 0.85, "21:00": 0.8, "22:00": 0.45 }[hora] ?? 0.5;
      if (rnd() > (pasada ? prob : prob * 0.7)) continue;

      const partidos = rnd() < 0.6 ? [["completa", ["A", "B"]]] : rnd() < 0.5 ? [["media", ["A"]], ["media", ["B"]]] : [["media", [rnd() < 0.5 ? "A" : "B"]]];
      for (const [tipo, lados] of partidos) {
        const [equipo, contacto] = EQUIPOS[Math.floor(rnd() * EQUIPOS.length)];
        const precio = tipo === "completa" ? config.precios.completa : config.precios.media;
        let estado = "confirmada";
        let pago = { estado: "pendiente", montoPagado: 0, actualizadoEn: null };
        if (pasada) {
          const x = rnd();
          estado = x < 0.06 ? "cancelada" : x < 0.1 ? "no_asistio" : "completada";
          if (estado === "completada") pago = rnd() < 0.85 ? { estado: "pagado", montoPagado: precio, actualizadoEn: new Date() } : pago;
        } else if (rnd() < 0.15) {
          estado = "pendiente";
        } else if (rnd() < 0.3) {
          pago = { estado: "abonado", montoPagado: Math.round(precio / 2), actualizadoEn: new Date() };
        }
        salida.push({
          empresa: empresaId,
          codigo: codigo(),
          fecha,
          hora,
          inicio: instante(fecha, hora).toDate(),
          tipo,
          lados,
          estado,
          activa: estado !== "cancelada",
          cliente: { nombre: contacto, telefono: "+56 9 0000 0000", telefonoNormalizado: `ejemplo-${equipo}`, email: "" },
          equipo,
          precio,
          pago,
          origen: rnd() < 0.7 ? "web" : "panel",
          aceptoReglas: true,
          ejemplo: true,
          historial: [{ nombreUsuario: "ejemplo", accion: "creada", detalle: "Dato de ejemplo" }],
        });
      }
    }
  }
  return salida;
};

/* ─────────── Principal ─────────── */

const main = async () => {
  if (!process.env.MONGO_URI) fallar("No encontré MONGO_URI en el .env. Corre esto desde la carpeta BARBERIA BACK.");
  await mongoose.connect(process.env.MONGO_URI);

  let empresa = await Empresa.findOne({ slug });
  const soloDatos = (ejemplo || borrarEjemplo) && empresa && !activar;

  if (!empresa) {
    if (!nombre) fallar('Falta --nombre="Nombre del recinto"');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) fallar("--correo no es válido (es el usuario para entrar al panel)");
    if (password.length < 8) fallar("--password debe tener al menos 8 caracteres");

    console.log("Se va a crear:");
    console.log(`  Recinto:  ${nombre}  (/${slug})  rubro: cancha  ·  prueba ${diasPrueba} días`);
    console.log(`  Admin:    ${correo}`);
    console.log("  Módulo canchas: activo · no aparece en el directorio público");
  } else if (!soloDatos) {
    console.log(`La empresa /${slug} ya existe (${empresa.nombre}). Se activará el módulo canchas.`);
  }
  if (ejemplo) console.log("  + Reservas de ejemplo de este mes y las próximas 2 semanas");
  if (borrarEjemplo) console.log("  − Se borran las reservas de ejemplo");

  if (!aplicar) {
    console.log("\nSIMULACIÓN: no se guardó nada. Agrega --aplicar para hacerlo de verdad.");
    await mongoose.disconnect();
    return;
  }

  if (!empresa) {
    empresa = await Empresa.create({
      nombre,
      slug,
      rubro: "cancha",
      telefono: telefono || undefined,
      correo,
      ciudad: ciudad || "",
      direccion: direccion || undefined,
      directorioVisible: false,
      rutEmpresa: "pendiente",
      trial: { activo: true, inicio: new Date(), fin: new Date(Date.now() + diasPrueba * 24 * 60 * 60 * 1000) },
      modulos: { canchas: true },
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
      await Empresa.deleteOne({ _id: empresa._id });
      throw e;
    }
  } else if (!soloDatos) {
    await Empresa.updateOne({ _id: empresa._id }, { $set: { "modulos.canchas": true } });
  }

  const config = await ConfiguracionCancha.findOneAndUpdate(
    { empresa: empresa._id },
    { $setOnInsert: { empresa: empresa._id, ...(telefono ? { telefonosAviso: [telefono] } : {}) } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  if (borrarEjemplo || ejemplo) {
    const { deletedCount } = await ReservaCancha.deleteMany({ empresa: empresa._id, ejemplo: true });
    if (deletedCount) console.log(`🗑️  Reservas de ejemplo borradas: ${deletedCount}`);
  }
  if (ejemplo) {
    const docs = reservasDeEjemplo(empresa._id, config);
    await ReservaCancha.insertMany(docs, { ordered: false });
    console.log(`⚽ Reservas de ejemplo creadas: ${docs.length}`);
  }

  console.log("\n✅ Listo.");
  console.log(`   Panel:   https://www.agendafonfach.cl/${slug}/login`);
  console.log(`   Público: https://www.agendafonfach.cl/${slug}`);
  console.log(`   Reservar: https://www.agendafonfach.cl/${slug}/reservar-cancha`);
  await mongoose.disconnect();
};

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Error inesperado:", e.message);
    process.exit(1);
  });
