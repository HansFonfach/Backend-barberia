import cron from "node-cron";
import jwt from "jsonwebtoken";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { detectarRecordatorios } from "../services/detectarRecordatorio.js";
import { clasificarCliente } from "../helpers/clasificarCliente.js";
import { generarMensajeRecordatorio } from "../helpers/generarMensajeRecordatorio.js";
import { sendRetentionEmail } from "../controllers/mailController.js";
import ClienteServicioStats from "../models/clienteServicioStats.model.js";
import reservaModel from "../models/reserva.model.js";
import ExcepcionHorarioModel from "../models/excepcionHorario.model.js";
import horarioModel from "../models/horario.model.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "America/Santiago";

// =============================================
// Busca el próximo slot disponible a la hora
// favorita del cliente en los próximos N días
// =============================================
const buscarProximoSlotFavorito = async ({
  barberoId,
  horaFavorita,
  servicioId,
  duracionServicio,
  diasBusqueda = 14,
}) => {
  const ahora = dayjs().tz(TZ);

  for (let i = 1; i <= diasBusqueda; i++) {
    const fecha = ahora.add(i, "day");
    const fechaStr = fecha.format("YYYY-MM-DD");
    const diaSemana = fecha.day();

    // ── Verificar que el barbero trabaja ese día ──
    const horarios = await horarioModel.find({
      barbero: barberoId,
      diaSemana,
    });
    if (!horarios.length) continue;

    // ── Verificar que no está de vacaciones / día bloqueado ──
    const excepcion = await ExcepcionHorarioModel.findOne({
      barbero: barberoId,
      $or: [
        {
          tipo: { $in: ["bloqueo_dia", "vacaciones"] },
          fecha: {
            $gte: fecha.startOf("day").utc().toDate(),
            $lte: fecha.endOf("day").utc().toDate(),
          },
        },
        {
          tipo: "vacaciones",
          fechaInicio: { $lte: fecha.endOf("day").utc().toDate() },
          fechaFin: { $gte: fecha.startOf("day").utc().toDate() },
        },
      ],
    });
    if (excepcion) continue;

    // ── Verificar que la hora favorita no está bloqueada ──
    const horaBloqueada = await ExcepcionHorarioModel.findOne({
      barbero: barberoId,
      tipo: "bloqueo",
      fecha: {
        $gte: fecha.startOf("day").utc().toDate(),
        $lte: fecha.endOf("day").utc().toDate(),
      },
      horaInicio: horaFavorita,
    });
    if (horaBloqueada) continue;

    // ── Verificar que la hora esté dentro del horario de trabajo ──
    const horaFavDayjs = dayjs.tz(
      `${fechaStr} ${horaFavorita}`,
      "YYYY-MM-DD HH:mm",
      TZ,
    );
    const horaFinServicio = horaFavDayjs.add(duracionServicio, "minute");

    const dentroDeTurno = horarios.some((h) => {
      const inicio = dayjs.tz(
        `${fechaStr} ${h.horaInicio}`,
        "YYYY-MM-DD HH:mm",
        TZ,
      );
      const fin = dayjs.tz(`${fechaStr} ${h.horaFin}`, "YYYY-MM-DD HH:mm", TZ);

      // Respetar colación si existe
      if (h.colacionInicio && h.colacionFin) {
        const colInicio = dayjs.tz(
          `${fechaStr} ${h.colacionInicio}`,
          "YYYY-MM-DD HH:mm",
          TZ,
        );
        const colFin = dayjs.tz(
          `${fechaStr} ${h.colacionFin}`,
          "YYYY-MM-DD HH:mm",
          TZ,
        );
        // No puede iniciar en colación ni terminar en colación
        if (horaFavDayjs.isBefore(colFin) && horaFinServicio.isAfter(colInicio))
          return false;
      }

      return (
        horaFavDayjs.isSameOrAfter(inicio) &&
        horaFinServicio.isSameOrBefore(fin)
      );
    });
    if (!dentroDeTurno) continue;

    // ── Verificar que no hay reserva en ese slot ──
    const inicioUTC = horaFavDayjs.utc().toDate();
    const finUTC = horaFinServicio.utc().toDate();

    const reservaExistente = await reservaModel.findOne({
      barbero: barberoId,
      estado: { $in: ["pendiente", "confirmada"] },
      fecha: { $lt: finUTC },
      $expr: {
        $gt: [
          { $add: ["$fecha", { $multiply: ["$duracion", 60000] }] },
          inicioUTC,
        ],
      },
    });
    if (reservaExistente) continue;

    // ✅ Slot encontrado
    return {
      fecha: fechaStr,
      hora: horaFavorita,
      fechaCompleta: horaFavDayjs.toDate(),
    };
  }

  return null; // No se encontró slot en los próximos N días
};

// =============================================
// Lógica central reutilizable
// =============================================
const procesarRecordatorios = async () => {
  const clientes = await detectarRecordatorios();

  let enviados = 0;
  let errores = 0;

  for (const c of clientes) {
    try {
      const tipoCliente = clasificarCliente(c.totalReservas);
      const mensaje = generarMensajeRecordatorio(
        c.cliente,
        c.servicio,
        tipoCliente,
        c.empresa,
      );

      // ── Buscar próximo slot si tenemos los datos necesarios ──
      let slotSugerido = null;
      let tokenAgendamiento = null;

      if (c.barberoFavoritoId && c.horaFavorita && c.servicio?.duracionMin) {
        slotSugerido = await buscarProximoSlotFavorito({
          barberoId: c.barberoFavoritoId,
          horaFavorita: c.horaFavorita,
          servicioId: c.servicio._id,
          duracionServicio: c.servicio.duracionMin,
          diasBusqueda: 14,
        });

        if (slotSugerido) {
          // Token válido por 48h con todos los datos para agendar
          tokenAgendamiento = jwt.sign(
            {
              clienteId: c.cliente._id,
              servicioId: c.servicio._id,
              barberoId: c.barberoFavoritoId,
              empresaId: c.empresa._id,
              fecha: slotSugerido.fechaCompleta,
              hora: slotSugerido.hora,
            },
            process.env.JWT_SECRET,
            { expiresIn: "48h" },
          );
        }
      }

      const linkAgendamiento = tokenAgendamiento
        ? `${process.env.FRONTEND_URL}/confirmar-reserva?token=${tokenAgendamiento}`
        : null;

      await sendRetentionEmail(c.cliente.email, {
        ...mensaje,
        nombreEmpresa: c.empresa?.nombre,
        // Datos del slot sugerido (el template los usa si existen)
        slotSugerido: slotSugerido
          ? {
              fecha: dayjs(slotSugerido.fecha)
                .locale("es")
                .format("dddd D [de] MMMM"),
              hora: slotSugerido.hora,
            }
          : null,
        linkAgendamiento,
      });

      await ClienteServicioStats.findByIdAndUpdate(c._id, {
        ultimaNotificacion: new Date(),
      });

      enviados++;
    } catch (err) {
      errores++;
      console.error(`❌ Error enviando a ${c.cliente?.email}:`, err.message);
    }
  }

  return { enviados, errores };
};

// =============================================
// Init cron
// =============================================
const init = () => {
  cron.schedule(
    "0 8 * * *",
    async () => {
      const result = await procesarRecordatorios();
    },
    { timezone: TZ },
  );
};

const enviarRecordatoriosDelDia = async () => {
  return await procesarRecordatorios();
};

export default {
  init,
  enviarRecordatoriosDelDia,
};
