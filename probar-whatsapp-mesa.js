// probar-whatsapp-mesa.js
//
// Manda AHORA MISMO los WhatsApp de una reserva de mesa, para probar las
// plantillas sin esperar al cron ni editar la base a mano.
//
// Cómo correrlo (desde la carpeta BARBERIA BACK, con el .env ahí mismo):
//   node probar-whatsapp-mesa.js santafe DHD4W2            → confirmación de asistencia al cliente
//   node probar-whatsapp-mesa.js santafe DHD4W2 --aviso    → aviso de reserva nueva a los números del local
//
//  - Usa el código de la reserva (el que sale como #DHD4W2 en el panel).
//  - La confirmación se manda al teléfono del CLIENTE de la reserva (para
//    probar, haz la reserva con tu celular). Deja guardado el token, así los
//    botones "Confirmar asistencia" / "No podré ir" funcionan de verdad.
//  - El aviso se manda a los números de Ajustes → Reservas web y avisos →
//    WhatsApp. No cambia nada en la base.
//  - Muestra la respuesta de Meta (si falla, el motivo).

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Empresa from "./src/models/empresa.model.js";
import ConfiguracionReservasMesa from "./src/models/configuracionReservasMesa.model.js";
import ReservaMesa from "./src/models/reservaMesa.model.js";
import { generarTokenCancelacion } from "./src/services/reservasMesa/utilidades.js";
import {
  whatsappConfirmacionAsistencia,
  whatsappAvisoLocal,
  PLANTILLA_CONFIRMACION,
  PLANTILLA_AVISO_LOCAL,
} from "./src/services/reservasMesa/whatsapp.js";

const args = process.argv.slice(2);
const [slug, codigo] = args.filter((a) => !a.startsWith("--"));
const aviso = args.includes("--aviso");

if (!slug || !codigo) {
  console.error("Uso: node probar-whatsapp-mesa.js <slug> <codigo-reserva> [--aviso]");
  process.exit(1);
}

const salir = async (codigoSalida) => {
  await mongoose.disconnect();
  process.exit(codigoSalida);
};

const main = async () => {
  if (!process.env.MONGO_URI) {
    console.error("No encontré MONGO_URI en el .env. Corre esto desde la carpeta BARBERIA BACK.");
    process.exit(1);
  }
  for (const v of ["ACCESS_TOKEN", "PHONE_NUMBER"]) {
    if (!process.env[v]) console.error(`⚠️  Falta ${v} en el .env: Meta va a rechazar el envío.`);
  }
  console.log(`Idioma de las plantillas: ${process.env.WHATSAPP_IDIOMA_MESAS || "es_CL"} (WHATSAPP_IDIOMA_MESAS)`);

  await mongoose.connect(process.env.MONGO_URI);

  const empresa = await Empresa.findOne({ slug: slug.toLowerCase() }).select("nombre slug telefono direccion").lean();
  if (!empresa) {
    console.error(`No existe una empresa con slug "${slug}".`);
    return salir(1);
  }
  const reserva = await ReservaMesa.findOne({ empresa: empresa._id, codigo: codigo.toUpperCase().replace("#", "") });
  if (!reserva) {
    console.error(`No existe la reserva ${codigo} en ${empresa.nombre}.`);
    return salir(1);
  }
  const config = await ConfiguracionReservasMesa.findOne({ empresa: empresa._id }).lean();

  console.log(`Reserva ${reserva.codigo}: ${reserva.cliente.nombre} · ${reserva.personas} pers. · ${reserva.fecha} ${reserva.hora} · ${reserva.estado}`);

  if (aviso) {
    const telefonos = config?.whatsapp?.avisoLocal?.telefonos || [];
    if (!telefonos.length) {
      console.error("No hay números configurados para el aviso (Ajustes → Reservas web y avisos → WhatsApp).");
      return salir(1);
    }
    console.log(`Enviando "${PLANTILLA_AVISO_LOCAL}" a: ${telefonos.join(", ")}`);
    const resultados = await whatsappAvisoLocal(reserva, empresa, telefonos);
    resultados.forEach((r, i) => console.log(`  ${telefonos[i]}: ${r.ok ? "✅ enviado" : `❌ ${r.error}`}`));
    return salir(resultados.every((r) => r.ok) ? 0 : 1);
  }

  if (!["pendiente", "confirmada"].includes(reserva.estado)) {
    console.error(`La reserva está "${reserva.estado}": los botones no servirían. Usa una pendiente o confirmada.`);
    return salir(1);
  }

  const token = generarTokenCancelacion();
  await ReservaMesa.updateOne(
    { _id: reserva._id },
    {
      $set: {
        "whatsapp.recordatorioEnviadoEn": new Date(),
        "whatsapp.tokenAsistencia": token.hash,
        "whatsapp.respuesta": null,
        "whatsapp.respondidaEn": null,
        "whatsapp.error": "",
      },
    },
  );
  const contacto = empresa.telefono || config?.whatsapp?.avisoLocal?.telefonos?.[0] || "";
  console.log(`Enviando "${PLANTILLA_CONFIRMACION}" a ${reserva.cliente.telefono}...`);
  const r = await whatsappConfirmacionAsistencia(reserva, empresa, token.token, new Date(), contacto);
  if (r.ok) {
    console.log("✅ Enviado. Revisa el WhatsApp del cliente y prueba los botones.");
  } else {
    console.log(`❌ Meta lo rechazó: ${r.error}`);
    await ReservaMesa.updateOne({ _id: reserva._id }, { $set: { "whatsapp.error": String(r.error).slice(0, 300) } });
  }
  return salir(r.ok ? 0 : 1);
};

main().catch(async (e) => {
  console.error("❌ Error:", e.message);
  await salir(1);
});
