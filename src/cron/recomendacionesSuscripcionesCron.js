import cron from "node-cron";
import reservaModel from "../models/reserva.model.js";
import usuarioModel from "../models/usuario.model.js";
import servicioModel from "../models/servicio.model.js";
import { sendRecomendacionSuscripcionEmail } from "../controllers/mailController.js";
import { PLANES, IDS_SERVICIOS_SUSCRIPCION } from "../config/planes.js";


export const iniciarCronSuscripcionesMensual = () => {
  cron.schedule("0 9 * * *", async () => {
    const hoy = new Date();

    // SOLO DÍA 1 DEL MES
    if (hoy.getDate() !== 1) return;

    console.log("📩 Campaña mensual iniciada...");

    const empresaId = "698de476677550fcd3d2209c";

    const reservas = await reservaModel
      .find({ empresa: empresaId })
      .populate("cliente", "nombre apellido email telefono suscrito ultimoEmailSuscripcion")
      .populate("servicio", "nombre");

    const estadosValidos = ["terminada", "finalizada", "completada"];

    const reservasValidas = reservas.filter((r) =>
      estadosValidos.includes((r.estado || "").toLowerCase())
    );

    // 💰 Precios reales de los 3 servicios que aplican a suscripción (los
    // mismos IDs fijos que usa clienteAnalyticsController.js), para no
    // volver a inventar un número — se busca una sola vez, no por cliente.
    const serviciosDB = await servicioModel.find(
      { _id: { $in: Object.values(IDS_SERVICIOS_SUSCRIPCION) } },
      "precio",
    );
    const PRECIOS = {
      corte:
        serviciosDB.find(
          (s) => s._id.toString() === IDS_SERVICIOS_SUSCRIPCION.corte,
        )?.precio || 0,
      barba:
        serviciosDB.find(
          (s) => s._id.toString() === IDS_SERVICIOS_SUSCRIPCION.barba,
        )?.precio || 0,
      combo:
        serviciosDB.find(
          (s) => s._id.toString() === IDS_SERVICIOS_SUSCRIPCION.combo,
        )?.precio || 0,
    };

    const clientesMap = new Map();

    const esBarba = (n = "") => n.toLowerCase().includes("barba");
    const esCorte = (n = "") => n.toLowerCase().includes("corte");

    // AGRUPAR CLIENTES
    for (const r of reservasValidas) {
      const c = r.cliente;
      if (!c?._id) continue;

      const id = c._id.toString();

      if (!clientesMap.has(id)) {
        clientesMap.set(id, {
          cliente: c,
          fechas: [],
          cortes: 0,
          barbas: 0,
          combos: 0,
        });
      }

      const item = clientesMap.get(id);

      item.fechas.push(r.fecha);

      const nombre = r.servicio?.nombre || "";

      if (esBarba(nombre) && esCorte(nombre)) item.combos++;
      else if (esBarba(nombre)) item.barbas++;
      else if (esCorte(nombre)) item.cortes++;
    }

    // PROCESAR CLIENTES
    for (const data of clientesMap.values()) {
      const { cliente, fechas, cortes, barbas, combos } = data;

      if (!cliente?._id) continue;
      if (cliente.suscrito) continue;
      if (fechas.length < 3) continue;

      const ahora = new Date();

      // 🛑 ANTI DUPLICADO (MES)
      const yaSeEnvioEsteMes =
        cliente.ultimoEmailSuscripcion &&
        cliente.ultimoEmailSuscripcion.getMonth() === ahora.getMonth() &&
        cliente.ultimoEmailSuscripcion.getFullYear() === ahora.getFullYear();

      if (yaSeEnvioEsteMes) continue;

      // PROMEDIO DÍAS
      const ordenadas = fechas.sort((a, b) => new Date(a) - new Date(b));

      let total = 0;
      for (let i = 1; i < ordenadas.length; i++) {
        const diff =
          (new Date(ordenadas[i]) - new Date(ordenadas[i - 1])) /
          (1000 * 60 * 60 * 24);
        total += diff;
      }

      const promedioDias = total / (ordenadas.length - 1);

      // 🔥 FILTRO FINAL
      if (promedioDias < 7 || promedioDias > 21) continue;

      // SUSCRIPCIÓN SUGERIDA
      let suscripcionSugerida = "creditos";

      if (combos / fechas.length >= 0.7) {
        suscripcionSugerida = "combo_visita_corte_barba";
      } else if (barbas > cortes) {
        suscripcionSugerida = "barba";
      }

      // 💰 AHORRO REAL (antes era un $5.000 fijo, igual para cualquier
      // cliente y cualquier plan — ahora se calcula de verdad):
      // 1) cuántas visitas al mes hace este cliente en la práctica
      //    (30 / promedio de días entre visitas),
      // 2) tope a lo que el plan realmente incluye (un plan de "2 al mes"
      //    no cubre 6 visitas, así que no se puede prometer ahorro por
      //    visitas que el plan no cubriría),
      // 3) el precio "normal" se toma del MISMO servicio que corresponde
      //    al plan sugerido arriba (antes eran dos lógicas separadas que
      //    a veces no coincidían: se recomendaba un plan y se cobraba el
      //    ahorro con el precio de otro servicio).
      const plan = PLANES[suscripcionSugerida];
      const precioServicio =
        suscripcionSugerida === "combo_visita_corte_barba"
          ? PRECIOS.combo
          : suscripcionSugerida === "barba"
            ? PRECIOS.barba
            : PRECIOS.corte;

      const visitasMensuales = Math.round(30 / promedioDias);
      const visitasCubiertas = Math.min(visitasMensuales, plan.serviciosIncluidos);

      const valorSinPlan = visitasCubiertas * precioServicio;
      const ahorroMensual = Math.max(valorSinPlan - plan.precio, 0);
      const ahorroAnual = ahorroMensual * 12;
      const equivalenteCortes =
        PRECIOS.corte > 0 ? Math.round(ahorroAnual / PRECIOS.corte) : 0;

      // Si con el plan sugerido no hay ahorro real (o no hay precio
      // cargado para ese servicio), no tiene sentido mandar un correo
      // ofreciendo "ahorra $0" — se salta este cliente.
      if (ahorroMensual <= 0) continue;

      // ENVIAR EMAIL
      await sendRecomendacionSuscripcionEmail(cliente.email, {
        nombreCliente: cliente.nombre,
        nombreEmpresa: "Agenda Fonfach",
        nombreBarbero: "Barbero",
        telefonoBarbero: cliente.telefono,

        suscripcionSugerida,
        precioPlan: plan.precio,

        motivo: `Vienes cada ${Math.round(promedioDias)} días aproximadamente`,
        ahorroMensual,
        ahorroAnual,
        equivalenteCortes,
      });

      // 🛑 MARCAR COMO ENVIADO
      await usuarioModel.findByIdAndUpdate(cliente._id, {
        ultimoEmailSuscripcion: new Date(),
      });
    }

    console.log("✔ Campaña mensual finalizada");
  });
};