import cron from "node-cron";
import { detectarRecordatorios } from "../services/detectarRecordatorio.js";
import { clasificarCliente } from "../helpers/clasificarCliente.js";
import { generarMensajeRecordatorio } from "../helpers/generarMensajeRecordatorio.js";
import {
  sendBaseEmail,
  sendRetentionEmail,
} from "../controllers/mailController.js";
import ClienteServicioStats from "../models/clienteServicioStats.model.js";

// Lógica central reutilizable
const procesarRecordatorios = async () => {
  console.log("🔍 Buscando clientes...");
  const clientes = await detectarRecordatorios();
  console.log(`📊 Clientes encontrados: ${clientes.length}`); // ← agrega esto

  let enviados = 0,
    errores = 0;

  for (const c of clientes) {
    try {
      const tipoCliente = clasificarCliente(c.totalReservas);
      const mensaje = generarMensajeRecordatorio(
        c.cliente,
        c.servicio,
        tipoCliente,
        c.empresa,
      );

      console.log(
        `📨 Enviando recordatorio a: ${c.cliente?.nombre} (${c.cliente?.email})`,
      );

      await sendRetentionEmail(c.cliente.email, {
        ...mensaje,
        nombreEmpresa: c.empresa?.nombre,
      });

      console.log(
        `✅ Enviado a: ${c.cliente?.email} | Servicio: ${c.servicio?.nombre}`,
      );

      c.ultimaNotificacion = new Date();
      await c.save();
      enviados++;
    } catch (err) {
      errores++;
      console.error(`❌ Error enviando a ${c.cliente?.email}:`, err.message);
    }
  }

  return { enviados, errores };
};

const init = () => {
  cron.schedule(
    "0 8 * * *", // minuto 0, hora 8, todos los días
    async () => {
      console.log("🔔 CRON TICK - Recordatorios diarios 8AM");
      const result = await procesarRecordatorios();
      console.log(
        `Recordatorios: ${result.enviados} enviados, ${result.errores} errores`,
      );
    },
    { timezone: "America/Santiago" },
  );

  // Disparo inmediato para verificar que funciona
  console.log("🚀 Ejecutando primer ciclo al arrancar...");
  procesarRecordatorios().then((r) =>
    console.log(`Primer ciclo: ${r.enviados} enviados, ${r.errores} errores`),
  );
};

// Para el router: fuerza el envío ahora mismo
const enviarRecordatoriosDelDia = async () => {
  return await procesarRecordatorios();
};

// Para el router: envía a un cliente específico por su stats ID o reservaId
const enviarRecordatorioManual = async (reservaId) => {
  const stats = await ClienteServicioStats.findOne({
    ultimaReserva: { $ne: null },
  })
    .populate("cliente")
    .populate("servicio");

  if (!stats) throw new Error("No se encontró stats para esa reserva");

  const tipoCliente = clasificarCliente(stats.totalReservas);
  const mensaje = generarMensajeRecordatorio(
    stats.cliente,
    stats.servicio,
    tipoCliente,
  );

  await sendBaseEmail({
    to: stats.cliente.email,
    subject: "Te extrañamos 👋",
    html: `<p>${mensaje}</p>`,
  });

  return {
    success: true,
    cliente: stats.cliente.nombre,
    email: stats.cliente.email,
    mensaje,
  };
};

// Alias para compatibilidad con tu router
const testEnviar = enviarRecordatorioManual;

export default {
  init,
  enviarRecordatoriosDelDia,
  enviarRecordatorioManual,
  testEnviar,
};
