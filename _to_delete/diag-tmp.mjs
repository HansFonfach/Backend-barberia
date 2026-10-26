import "dotenv/config";
import mongoose from "mongoose";
const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DB_URI;
await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
const db = mongoose.connection.db;
const emp = await db.collection("empresas").findOne({ slug: "santafe" }, { projection: { _id: 1 } });
const cfg = await db.collection("configuracionesReservasMesa").findOne({ empresa: emp._id });
console.log("sectores:", cfg.sectores.map((s) => `${s.nombre} cap=${s.capacidad} web=${s.reservableOnline} activo=${s.activo}`).join(" | "));
console.log("duracion:", cfg.duracionMinutos, "intervalo:", cfg.intervaloMinutos, "maxWeb:", cfg.maxPersonasWeb, "horario:", JSON.stringify(cfg.horario.filter((h) => h.abierto)));
const res = await db.collection("reservasMesa").find({ empresa: emp._id, estado: { $in: ["pendiente", "confirmada", "llego"] } }).project({ fecha: 1, hora: 1, personas: 1, "sector.nombre": 1, estado: 1, ocupaCupo: 1, franjas: 1 }).sort({ fecha: 1, hora: 1 }).toArray();
for (const r of res) console.log("reserva", r.fecha, r.hora, r.sector.nombre, r.personas, r.estado, "ocupaCupo=", r.ocupaCupo, "franjas=", r.franjas?.length);
const sal = cfg.sectores.find((s) => s.nombre.toLowerCase().startsWith("sal"));
const occ = await db.collection("ocupacionFranjasMesa").find({ empresa: emp._id, sector: sal._id }).sort({ franja: 1 }).toArray();
const resumen = {};
for (const o of occ) { const k = o.personas; resumen[k] = (resumen[k] || 0) + 1; }
console.log("franjas Salón: total", occ.length, "personas→cantidad", JSON.stringify(resumen), "primera", occ[0]?.franja, "ultima", occ.at(-1)?.franja);
await mongoose.disconnect();
