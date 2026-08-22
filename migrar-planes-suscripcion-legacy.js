// migrar-planes-suscripcion-legacy.js
//
// Recrea, como PlanSuscripcion editables desde la app (Gestión de planes de
// suscripción), los 4 planes que hoy están escritos a mano en el código
// (tipoPlan "creditos", "combo_visita_corte_barba", "padre_e_hijo" y
// "barba"). Esto NO toca ni migra ninguna suscripción ya activa: esas
// siguen funcionando exactamente igual con su tipoPlan de siempre. Es solo
// para que, de ahora en adelante, el negocio pueda editar estos 4 planes
// (precio, cupos, días de calendario, etc.) desde la pantalla nueva en vez
// de tener que pedir un cambio de código.
//
// Nota importante: "La Santa Navaja" y "En el nombre del padre y del hijo"
// tenían una regla especial en el código viejo (una reserva de 120+ minutos
// gastaba 2 créditos en vez de 1). El sistema nuevo cuenta 1 reserva = 1
// crédito, más simple y predecible. Si quieres compensar eso, ajusta la
// "cantidad por ciclo" del plan migrado desde la pantalla de gestión.
//
// Cómo correrlo (desde la carpeta BARBERIA BACK, con el .env ahí mismo):
//   node migrar-planes-suscripcion-legacy.js
//
// Se puede correr más de una vez sin problema: si un plan con ese nombre ya
// existe para la empresa, no lo vuelve a crear.

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Empresa from "./src/models/empresa.model.js";
import PlanSuscripcion from "./src/models/planSuscripcion.model.js";

const SLUG_EMPRESA = "lasantabarberia";

// IDs de servicio que ya estaban hardcodeados en suscripcionController.js
const SERVICIO_COMBO_ID = "69934ce087e49726a2cd3da1"; // Corte + perfilado barba
const SERVICIO_BARBA_ID = "6993a5495dada31f33304c19"; // Barba

const PLANES_LEGACY = [
  {
    nombre: "La Santa Navaja",
    descripcion: "2 servicios al mes (corte o barba, a elección)",
    precio: 25000,
    duracionDias: 30,
    cicloDias: 30,
    cantidadPorCiclo: 2,
    serviciosPermitidos: [], // cualquier servicio, igual que el tipoPlan "creditos"
    diasVisibilidadCalendario: 40,
  },
  {
    nombre: "La Santa Dupla",
    descripcion: "2 visitas al mes de corte + perfilado de barba",
    precio: 40000,
    duracionDias: 30,
    cicloDias: 30,
    cantidadPorCiclo: 2,
    serviciosPermitidos: [SERVICIO_COMBO_ID],
    diasVisibilidadCalendario: 40,
  },
  {
    nombre: "En el nombre del padre y del hijo",
    descripcion: "2 visitas al mes, 2 cortes",
    precio: 22000,
    duracionDias: 30,
    cicloDias: 30,
    cantidadPorCiclo: 2,
    serviciosPermitidos: [], // cualquier servicio, igual que el tipoPlan "padre_e_hijo"
    diasVisibilidadCalendario: 40,
  },
  {
    nombre: "La Santa Barba",
    descripcion: "4 servicios de barba al mes",
    precio: 40000,
    duracionDias: 30,
    cicloDias: 30,
    cantidadPorCiclo: 4,
    serviciosPermitidos: [SERVICIO_BARBA_ID],
    diasVisibilidadCalendario: 40,
  },
];

const main = async () => {
  if (!process.env.MONGO_URI) {
    console.error(
      "❌ No encontré MONGO_URI en el .env. Corre este script desde la carpeta BARBERIA BACK.",
    );
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Conectado a la base de datos");

  const empresa = await Empresa.findOne({ slug: SLUG_EMPRESA });
  if (!empresa) {
    console.error(`❌ No encontré ninguna empresa con slug "${SLUG_EMPRESA}".`);
    console.error(
      "   Si el slug de La Santa Barbería es otro, cámbialo en la constante SLUG_EMPRESA de este script.",
    );
    process.exit(1);
  }

  console.log(`Empresa encontrada: ${empresa.nombre} (${empresa.slug})\n`);

  for (const datos of PLANES_LEGACY) {
    const existente = await PlanSuscripcion.findOne({
      empresa: empresa._id,
      nombre: datos.nombre,
    });

    if (existente) {
      console.log(`↷ "${datos.nombre}" ya existe, no se vuelve a crear.`);
      continue;
    }

    await PlanSuscripcion.create({ ...datos, empresa: empresa._id });
    console.log(`✅ Plan creado: "${datos.nombre}" ($${datos.precio.toLocaleString("es-CL")})`);
  }

  console.log(
    "\n🎉 Listo. Entra a Gestión → Planes de suscripción para verlos, editarlos o crear planes nuevos.",
  );

  await mongoose.disconnect();
  process.exit(0);
};

main().catch((err) => {
  console.error("❌ Error inesperado:", err);
  process.exit(1);
});
