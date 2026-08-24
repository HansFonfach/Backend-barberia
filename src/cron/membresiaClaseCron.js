import cron from "node-cron";
import MembresiaClase from "../models/membresiaClase.model.js";
import SolicitudMembresiaClase from "../models/solicitudMembresiaClase.model.js";
import {
  sendRecordatorioVencimientoMembresiaEmail,
  sendMembresiaVencidaWinbackEmail,
  sendSolicitudMembresiaPendienteRecordatorioEmail,
} from "../controllers/mailController.js";

// Cron del ciclo de vida de las membresías de clases (gimnasios):
// - Recordatorio 5 días antes de vencer
// - Recordatorio el mismo día que vence
// - Desactivación de mensualidades vencidas (higiene, igual que suscripcionesCron)
// - Correo de "te extrañamos" (win-back) a los 20 días de vencida sin renovar
// - Recordatorio de solicitudes de pago que llevan demasiado tiempo pendientes

const DIAS_WINBACK = 20;
const HORAS_SOLICITUD_PENDIENTE = 48;
const BASE_URL = "https://www.agendafonfach.cl";

const inicioDelDia = (fecha) => {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
};

const finDelDia = (fecha) => {
  const d = new Date(fecha);
  d.setHours(23, 59, 59, 999);
  return d;
};

const sumarDias = (fecha, dias) => {
  const d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  return d;
};

const linkRenovarDe = (empresa) => `${BASE_URL}/${empresa.slug}/admin/mi-plan`;

const enviarRecordatorioVencimiento = async (membresia, diasRestantes, campo) => {
  try {
    const cliente = membresia.cliente;
    const empresa = membresia.empresa;
    if (!cliente?.email || !empresa) return;

    await sendRecordatorioVencimientoMembresiaEmail(cliente.email, {
      nombreCliente: cliente.nombre,
      nombreEmpresa: empresa.nombre,
      nombrePlan: membresia.nombrePlan,
      fechaFin: membresia.fechaFin,
      diasRestantes,
      linkRenovar: linkRenovarDe(empresa),
    });

    membresia[campo] = true;
    await membresia.save();
  } catch (error) {
    console.error(
      `❌ Error enviando recordatorio (${campo}) a ${membresia.cliente?.email}:`,
      error.message,
    );
  }
};

const procesarRecordatoriosVencimiento = async () => {
  const hoy = new Date();

  // 5 días antes de vencer
  const membresias5d = await MembresiaClase.find({
    activa: true,
    recordatorio5dEnviado: false,
    fechaFin: {
      $gte: inicioDelDia(sumarDias(hoy, 5)),
      $lte: finDelDia(sumarDias(hoy, 5)),
    },
  })
    .populate("cliente", "nombre email")
    .populate("empresa", "nombre slug");

  for (const m of membresias5d) {
    await enviarRecordatorioVencimiento(m, 5, "recordatorio5dEnviado");
  }

  // Vence hoy
  const membresiasHoy = await MembresiaClase.find({
    activa: true,
    recordatorioDiaEnviado: false,
    fechaFin: { $gte: inicioDelDia(hoy), $lte: finDelDia(hoy) },
  })
    .populate("cliente", "nombre email")
    .populate("empresa", "nombre slug");

  for (const m of membresiasHoy) {
    await enviarRecordatorioVencimiento(m, 0, "recordatorioDiaEnviado");
  }
};

// Desactiva mensualidades activas cuya fecha ya pasó (mismo criterio que suscripcionesCron)
const procesarVencidas = async () => {
  const hoy = new Date();

  const vencidas = await MembresiaClase.find({
    activa: true,
    fechaFin: { $lt: hoy },
  });

  for (const m of vencidas) {
    m.activa = false;
    m.historial = true;
    await m.save();
  }
};

const procesarWinback = async () => {
  const hoy = new Date();
  const fechaObjetivo = sumarDias(hoy, -DIAS_WINBACK);

  const membresias = await MembresiaClase.find({
    recordatorioWinbackEnviado: false,
    fechaFin: {
      $gte: inicioDelDia(fechaObjetivo),
      $lte: finDelDia(fechaObjetivo),
    },
  })
    .populate("cliente", "nombre email")
    .populate("empresa", "nombre slug");

  for (const m of membresias) {
    try {
      const cliente = m.cliente;
      const empresa = m.empresa;
      if (!cliente?.email || !empresa) continue;

      await sendMembresiaVencidaWinbackEmail(cliente.email, {
        nombreCliente: cliente.nombre,
        nombreEmpresa: empresa.nombre,
        nombrePlan: m.nombrePlan,
        fechaFin: m.fechaFin,
        linkRenovar: linkRenovarDe(empresa),
      });

      m.recordatorioWinbackEnviado = true;
      await m.save();
    } catch (error) {
      console.error(
        `❌ Error enviando correo de win-back a ${m.cliente?.email}:`,
        error.message,
      );
    }
  }
};

// Solicitudes de pago (checkout público o del cliente logueado) que llevan
// más de HORAS_SOLICITUD_PENDIENTE sin resolverse — se le recuerda al
// cliente una sola vez (recordatorioPendienteEnviado evita repetirlo).
const procesarSolicitudesPendientes = async () => {
  const limite = new Date();
  limite.setHours(limite.getHours() - HORAS_SOLICITUD_PENDIENTE);

  const solicitudes = await SolicitudMembresiaClase.find({
    estado: "pendiente",
    recordatorioPendienteEnviado: false,
    createdAt: { $lte: limite },
  })
    .populate("cliente", "nombre email")
    .populate("empresa", "nombre");

  for (const s of solicitudes) {
    try {
      const cliente = s.cliente;
      const empresa = s.empresa;
      if (!cliente?.email || !empresa) continue;

      await sendSolicitudMembresiaPendienteRecordatorioEmail(cliente.email, {
        nombreCliente: cliente.nombre,
        nombreEmpresa: empresa.nombre,
        nombrePlan: s.nombrePlan,
      });

      s.recordatorioPendienteEnviado = true;
      await s.save();
    } catch (error) {
      console.error(
        `❌ Error enviando recordatorio de solicitud pendiente a ${s.cliente?.email}:`,
        error.message,
      );
    }
  }
};

export const iniciarCronMembresiaClase = () => {
  cron.schedule(
    "0 9 * * *", // todos los días a las 9:00 AM (hora de Chile)
    async () => {
      try {
        await procesarRecordatoriosVencimiento();
        await procesarVencidas();
        await procesarWinback();
        await procesarSolicitudesPendientes();
        console.log("✅ Cron de membresías de clases ejecutado correctamente");
      } catch (error) {
        console.error("❌ Error en cron de membresías de clases:", error);
      }
    },
    { timezone: "America/Santiago" },
  );
};
