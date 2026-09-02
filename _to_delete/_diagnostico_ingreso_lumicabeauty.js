// Script de solo lectura: lista las reservas de "lumicabeauty" en lo que va
// del mes que cuentan como ingreso (todas menos canceladas / no_asistio),
// para encontrar cuál está inflando el número de "Reservas cobradas".
// No modifica nada. Ejecutar desde la carpeta BARBERIA BACK con:
//   node _diagnostico_ingreso_lumicabeauty.js
// Cuando termines de revisar, puedes borrar este archivo.

import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config({ path: ".env" });

const SLUG = "lumicabeauty";

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const Empresa = mongoose.model("Empresa", new mongoose.Schema({}, { strict: false }), "empresas");
  // servicio/cliente declarados como ref explícitos para que populate() los
  // reconozca (Mongoose exige que el path exista en el schema para poblarlo,
  // aunque el resto del documento sea "strict: false" y se lea igual).
  const reservaSchema = new mongoose.Schema(
    {
      servicio: { type: mongoose.Schema.Types.ObjectId, ref: "Servicio" },
      cliente: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
    },
    { strict: false },
  );
  const Reserva = mongoose.model("Reserva", reservaSchema, "reservas");
  mongoose.model("Servicio", new mongoose.Schema({}, { strict: false }), "servicios");
  mongoose.model("Usuario", new mongoose.Schema({}, { strict: false }), "usuarios");

  const empresa = await Empresa.findOne({ slug: SLUG }).lean();
  if (!empresa) {
    console.log(`EMPRESA NO ENCONTRADA con slug "${SLUG}"`);
    process.exit(1);
  }
  console.log("Empresa:", empresa.nombre, "| id:", empresa._id.toString());

  const ahora = new Date();
  const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1, 0, 0, 0);

  const reservas = await Reserva.find({
    empresa: empresa._id,
    fecha: { $gte: inicio, $lte: ahora },
    estado: { $nin: ["cancelada", "no_asistio"] },
  })
    .populate("servicio", "nombre precio")
    .populate("cliente", "nombre apellido telefono")
    .sort({ fecha: 1 })
    .lean();

  console.log(`\nReservas del mes que SUMAN como ingreso: ${reservas.length}\n`);

  let total = 0;
  for (const r of reservas) {
    const precio = r.precio ?? r.servicio?.precio ?? 0;
    const extras = r.totalExtras || 0;
    const productos = r.totalProductos || 0;
    total += precio;
    const nombreCliente = r.cliente
      ? `${r.cliente.nombre || ""} ${r.cliente.apellido || ""}`.trim()
      : r.invitado?.nombre || "invitado sin nombre";
    console.log(
      `- id=${r._id} | fecha=${new Date(r.fecha).toLocaleString("es-CL", { timeZone: "America/Santiago" })} | estado=${r.estado} | cliente=${nombreCliente} tel=${r.cliente?.telefono || r.invitado?.telefono || "-"} | servicio=${r.servicio?.nombre || "-"} | precio=${precio} | extras=${extras} | productos=${productos}`,
    );
  }
  console.log(`\nSuma de precios de servicio (esto es "Reservas cobradas" en el dashboard): $${total}`);

  await mongoose.disconnect();
};

run().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
