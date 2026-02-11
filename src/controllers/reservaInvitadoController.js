import Reserva from "../models/reserva.model.js";
import excepcionHorarioModel from "../models/excepcionHorario.model.js";
import usuarioModel from "../models/usuario.model.js";
import { formatHora } from "../utils/horas.js";
import suscripcionModel from "../models/suscripcion.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore.js";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter.js";
import { sendReservationEmail } from "./mailController.js";
import notificacionModel from "../models/notificacion.Model.js";
import barberoServicioModel from "../models/barberoServicio.model.js";
import WhatsAppService from "../services/WhatsAppService.js";
import crypto from 'crypto';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

// ==============================
export const createReservaInvitado = async (req, res) => {
  try {
    const { barbero, servicio, fecha, hora, invitado } = req.body;

    // ------------------------------
    // Validaciones básicas
    // ------------------------------
    if (!barbero || !servicio || !fecha || !hora || !invitado) {
      return res.status(400).json({
        message:
          "Todos los campos son obligatorios (barbero, servicio, fecha, hora, invitado)",
      });
    }

    if (
      !invitado.nombre ||
      !invitado.email ||
      !invitado.rut ||
      !invitado.telefono
    ) {
      return res.status(400).json({
        message: "El invitado debe tener nombre, email, rut y teléfono",
      });
    }

    // ------------------------------
    // Fecha y hora - CORREGIDO: Combinar fecha y hora
    // ------------------------------
    console.log("🔄 createReservaInvitado - VERSIÓN CORREGIDA");
    console.log("📥 Datos recibidos:", {
      barbero,
      servicio,
      fecha,
      hora,
      invitado: invitado.email,
    });

    const ahoraChile = dayjs().tz("America/Santiago");
    console.log("🕐 Ahora en Chile:", ahoraChile.format("YYYY-MM-DD HH:mm"));

    // Crear la fecha completa EN CHILE combinando fecha y hora
    const fechaCompletaChile = dayjs
      .tz(`${fecha} ${hora}`, "YYYY-MM-DD HH:mm", "America/Santiago")
      .startOf("minute");

    if (!fechaCompletaChile.isValid()) {
      return res.status(400).json({ message: "Fecha u hora inválida" });
    }

    const fechaCompletaUTC = fechaCompletaChile.utc();
    const fechaObj = fechaCompletaUTC.toDate();
    const diaSemana = fechaCompletaChile.day();

    console.log(
      "📅 Fecha Chile:",
      fechaCompletaChile.format("YYYY-MM-DD HH:mm"),
    );
    console.log("📅 Fecha UTC:", fechaCompletaUTC.format("YYYY-MM-DD HH:mm"));
    console.log("📅 Día semana:", diaSemana);

    // ------------------------------
    // Restricción sábado para invitados
    // ------------------------------
    if (diaSemana === 6) {
      return res
        .status(403)
        .json({ message: "Los invitados no pueden reservar los sábados" });
    }

    // ------------------------------
    // Barbero
    // ------------------------------
    const barberoDoc = await usuarioModel
      .findById(barbero)
      .populate("horariosDisponibles");
    if (!barberoDoc)
      return res.status(404).json({ message: "Barbero no encontrado" });

    console.log("💈 Barbero:", barberoDoc.nombre);

    // ------------------------------
    // Servicio
    // ------------------------------
    const barberoServicio = await barberoServicioModel
      .findOne({ barbero, servicio, activo: true })
      .populate("servicio");

    if (!barberoServicio) {
      return res
        .status(400)
        .json({ message: "El servicio no está disponible para este barbero" });
    }

    const duracionServicio = barberoServicio.duracion;
    const precioServicio = barberoServicio.precio;
    const nombreServicio = barberoServicio.servicio.nombre;
    const intervaloMinimo = barberoServicio.intervaloMinimo || 15;

    console.log("⏱️ Duración:", duracionServicio, "minutos");
    console.log("📐 Intervalo mínimo:", intervaloMinimo, "minutos");

    const inicioReserva = fechaCompletaChile;
    const finReserva = fechaCompletaChile
      .add(duracionServicio, "minute")
      .startOf("minute");

    console.log(
      `🕒 Servicio solicitado: ${inicioReserva.format("HH:mm")} - ${finReserva.format("HH:mm")} (${duracionServicio} min)`,
    );

    // ------------------------------
    // Horarios del día
    // ------------------------------
    let horariosDelDia = barberoDoc.horariosDisponibles.filter(
      (h) => Number(h.diaSemana) === diaSemana,
    );

    if (horariosDelDia.length === 0) {
      horariosDelDia = barberoDoc.horariosDisponibles.filter(
        (h) => Number(h.dia) === diaSemana,
      );
    }

    if (horariosDelDia.length === 0) {
      return res.status(400).json({
        message: "El barbero no trabaja este día",
        diaSemana: diaSemana,
      });
    }

    // ------------------------------
    // Validar horario del barbero - CORREGIDO
    // ------------------------------
    let horarioValido = null;
    for (const horario of horariosDelDia) {
      const horarioInicio = dayjs
        .tz(
          `${fecha} ${horario.horaInicio}`,
          "YYYY-MM-DD HH:mm",
          "America/Santiago",
        )
        .startOf("minute");
      const horarioFin = dayjs
        .tz(
          `${fecha} ${horario.horaFin}`,
          "YYYY-MM-DD HH:mm",
          "America/Santiago",
        )
        .startOf("minute");

      if (
        inicioReserva.isSameOrAfter(horarioInicio) &&
        finReserva.isSameOrBefore(horarioFin)
      ) {
        horarioValido = { inicio: horarioInicio, fin: horarioFin };
        console.log(
          `✅ Cabe en horario: ${horarioInicio.format("HH:mm")}-${horarioFin.format("HH:mm")}`,
        );
        break;
      }
    }

    if (!horarioValido) {
      console.log("❌ No cabe en horarios del barbero");
      return res.status(400).json({
        message: "El servicio no cabe en el horario del barbero",
        detalles: {
          horaInicio: inicioReserva.format("HH:mm"),
          horaFin: finReserva.format("HH:mm"),
          duracion: duracionServicio,
        },
      });
    }

    // ------------------------------
    // Excepciones / bloqueos - CORREGIDO
    // ------------------------------
    const inicioDiaChile = fechaCompletaChile.startOf("day");
    const finDiaChile = fechaCompletaChile.endOf("day");

    const inicioDiaUTC = inicioDiaChile.utc().toDate();
    const finDiaUTC = finDiaChile.utc().toDate();

    console.log(
      "🌅 Inicio día Chile:",
      inicioDiaChile.format("YYYY-MM-DD HH:mm"),
    );
    console.log("🌃 Fin día Chile:", finDiaChile.format("YYYY-MM-DD HH:mm"));

    const excepciones = await excepcionHorarioModel.find({
      barbero,
      fecha: { $gte: inicioDiaUTC, $lt: finDiaUTC },
    });

    const horasBloqueadas = excepciones
      .filter((e) => e.tipo === "bloqueo")
      .map((e) => dayjs(e.fecha).tz("America/Santiago").format("HH:mm"));

    console.log("🚫 Horas bloqueadas:", horasBloqueadas);

    if (horasBloqueadas.includes(inicioReserva.format("HH:mm"))) {
      console.log("❌ Hora bloqueada por excepción");
      return res.status(400).json({
        message: "La hora está bloqueada por el barbero",
        hora: inicioReserva.format("HH:mm"),
      });
    }

    // ------------------------------
    // Reservas existentes - CORREGIDO
    // ------------------------------
    const reservasDelDia = await Reserva.find({
      barbero,
      fecha: { $gte: inicioDiaUTC, $lt: finDiaUTC },
      estado: { $in: ["pendiente", "confirmada"] },
    });

    console.log("📅 Reservas existentes encontradas:", reservasDelDia.length);

    // Log para debug: mostrar todas las reservas existentes en Chile
    console.log("🔍 Revisando colisiones con reservas existentes:");
    reservasDelDia.forEach((reserva, index) => {
      const inicioExistente = dayjs(reserva.fecha).tz("America/Santiago");
      const finExistente = inicioExistente.add(reserva.duracion, "minute");
      console.log(
        `   Reserva ${index + 1}: ${inicioExistente.format("HH:mm")}-${finExistente.format("HH:mm")} (${reserva.duracion} min)`,
      );
    });

    // ------------------------------
    // Verificar colisiones - CORREGIDO
    // ------------------------------
    let hayColision = false;

    for (const r of reservasDelDia) {
      const inicioExistente = dayjs(r.fecha)
        .tz("America/Santiago")
        .startOf("minute");
      const finExistente = inicioExistente
        .add(r.duracion, "minute")
        .startOf("minute");

      const seSolapan =
        (inicioReserva.isBefore(finExistente) &&
          finReserva.isAfter(inicioExistente)) ||
        (inicioReserva.isSameOrBefore(inicioExistente) &&
          finReserva.isSameOrAfter(finExistente)) ||
        (inicioReserva.isSame(inicioExistente) &&
          finReserva.isSame(finExistente));

      if (seSolapan) {
        console.log(
          `⚠️ COLISIÓN detectada: ${inicioExistente.format("HH:mm")}-${finExistente.format("HH:mm")}`,
        );
        hayColision = true;
        break;
      }
    }

    if (hayColision) {
      console.log("❌ Colisión con reserva existente");
      return res.status(400).json({
        message: "La hora ya está ocupada o se solapa con otra reserva",
        detalles: {
          horaSolicitada: hora,
          duracionServicio: duracionServicio,
          horaFin: finReserva.format("HH:mm"),
        },
      });
    }

    // ------------------------------
    // Intervalo mínimo
    // ------------------------------
    const minutosHora = horaAminutos(hora);
    if (minutosHora % intervaloMinimo !== 0) {
      console.log(`❌ Hora no es múltiplo de ${intervaloMinimo} min`);
      return res.status(400).json({
        message: `La hora debe ser múltiplo de ${intervaloMinimo} minutos`,
        hora: hora,
        intervaloMinimo: intervaloMinimo,
      });
    }

    // ------------------------------
    // No permitir horas pasadas
    // ------------------------------
    if (fechaCompletaChile.isSame(ahoraChile, "day")) {
      const buffer = ahoraChile.add(30, "minute");
      if (inicioReserva.isBefore(buffer)) {
        console.log("❌ Hora pasada o muy cercana");
        return res.status(400).json({
          message:
            "No se pueden reservar horas pasadas o con menos de 30 minutos de anticipación",
        });
      }
    }

    console.log(
      "✅ TODAS LAS VALIDACIONES PASADAS - Creando reserva invitado...",
    );

    // ------------------------------
    // Crear reserva invitado
    // ------------------------------
    const cancelToken = crypto.randomBytes(32).toString("hex");

    const nuevaReserva = await Reserva.create({
      cliente: null,
      invitado,
      barbero,
      servicio,
      fecha: fechaObj,
      duracion: duracionServicio,
      estado: "pendiente",
      precio: precioServicio,
      cancelToken,
      cancelTokenExpira: dayjs(fechaObj).subtract(30, "minute").toDate(),
    });

    // ------------------------------
    // Enviar email invitado
    // ------------------------------
    try {
      await sendGuestReservationEmail(invitado.email, {
        nombreCliente: invitado.nombre,
        nombreBarbero: barberoDoc.nombre,
        fecha: fechaCompletaChile.format("DD-MM-YYYY"),
        hora: inicioReserva.format("HH:mm"),
        servicio: nombreServicio,
        horaFin: finReserva.format("HH:mm"),
        duracion: duracionServicio,
      });
      console.log("✅ Email enviado a invitado");
    } catch (emailError) {
      console.error("⚠️ Error enviando email a invitado:", emailError);
    }

    // ------------------------------
    // Respuesta
    // ------------------------------
    const respuesta = {
      ...nuevaReserva.toObject(),
      fechaChile: inicioReserva.format("YYYY-MM-DD HH:mm"),
      nombreServicio,
      horaFin: finReserva.format("HH:mm"),
      intervaloMinimo,
      duracion: duracionServicio,
      precio: precioServicio,
    };

    console.log("✅ Reserva invitado creada exitosamente:", nuevaReserva._id);
    res.status(201).json(respuesta);
  } catch (error) {
    console.error("❌ Error createReservaInvitado:", error);
    res.status(500).json({
      message: "Error al crear la reserva",
      error: error.message,
    });
  }
};

// Función auxiliar para convertir hora a minutos
function horaAminutos(hora) {
  const [horas, minutos] = hora.split(":").map(Number);
  return horas * 60 + minutos;
}

export const getReservasInvitado = async (req, res) => {
  try {
    const { email, token } = req.query;

    if (!email || !token) {
      return res.status(400).json({
        message: "Email y token son obligatorios",
      });
    }

    const reservas = await Reserva.find({
      "invitado.email": email,
      cancelToken: token,
    })
      .populate("barbero", "nombre")
      .populate("servicio", "nombre")
      .sort({ fecha: -1 });

    if (reservas.length === 0) {
      return res.status(404).json({
        message: "No se encontraron reservas",
      });
    }

    const reservasFormateadas = reservas.map((r) => {
      const fechaChile = dayjs(r.fecha).tz("America/Santiago");

      return {
        id: r._id,
        estado: r.estado,
        barbero: r.barbero?.nombre,
        servicio: r.servicio?.nombre,
        fecha: fechaChile.format("DD-MM-YYYY"),
        hora: fechaChile.format("HH:mm"),
        puedeCancelar:
          fechaChile.diff(dayjs().tz("America/Santiago"), "minute") > 30,
      };
    });

    res.json(reservasFormateadas);
  } catch (error) {
    console.error("❌ Error getReservasInvitado:", error);
    res.status(500).json({
      message: "Error al obtener reservas",
    });
  }
};

export const cancelarReservaInvitado = async (req, res) => {
  try {
    const { id } = req.params;
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        message: "Token requerido",
      });
    }

    const reserva = await Reserva.findOne({
      _id: id,
      cancelToken: token,
    });

    if (!reserva) {
      return res.status(404).json({
        message: "Reserva no encontrada",
      });
    }

    if (reserva.estado === "cancelada") {
      return res.status(400).json({
        message: "La reserva ya está cancelada",
      });
    }

    const ahoraChile = dayjs().tz("America/Santiago");
    const fechaReserva = dayjs(reserva.fecha).tz("America/Santiago");

    const minutosAntes = fechaReserva.diff(ahoraChile, "minute");

    if (minutosAntes <= 30) {
      return res.status(403).json({
        message: "Solo puedes cancelar hasta 30 minutos antes",
      });
    }

    reserva.estado = "cancelada";
    await reserva.save();

    res.json({
      message: "Reserva cancelada correctamente",
    });
  } catch (error) {
    console.error("❌ Error cancelarReservaInvitado:", error);
    res.status(500).json({
      message: "Error al cancelar la reserva",
    });
  }
};
