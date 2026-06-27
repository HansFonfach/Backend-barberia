import cron from "node-cron";
import reservaModel from "../models/reserva.model.js";
import usuarioModel from "../models/usuario.model.js";
import { sendRecomendacionSuscripcionEmail } from "../controllers/mailController.js";


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

      const ahorroMensual = 5000;

      // ENVIAR EMAIL
      await sendRecomendacionSuscripcionEmail(cliente.email, {
        nombreCliente: cliente.nombre,
        nombreEmpresa: "Agenda Fonfach",
        nombreBarbero: "Barbero",
        telefonoBarbero: cliente.telefono,

        suscripcionSugerida,

        motivo: `Vienes cada ${Math.round(promedioDias)} días aproximadamente`,
        ahorroMensual,
        ahorroAnual: ahorroMensual * 12,
        equivalenteCortes: Math.round(ahorroMensual / 15000),
      });

      // 🛑 MARCAR COMO ENVIADO
      await usuarioModel.findByIdAndUpdate(cliente._id, {
        ultimoEmailSuscripcion: new Date(),
      });
    }

    console.log("✔ Campaña mensual finalizada");
  });
};