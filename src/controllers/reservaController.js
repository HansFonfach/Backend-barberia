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
import {
  sendReservationEmail,
  sendWaitlistNotificationEmail,
} from "./mailController.js";
import notificacionModel from "../models/notificacion.Model.js";
import barberoServicioModel from "../models/barberoServicio.model.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

// 🔹 Función auxiliar: Calcular huecos disponibles (MISMA que en getHorasDisponibles)
const calcularHuecosDisponibles = (reservasDelDia, diaCompleto) => {
  // Ordenar reservas por hora de inicio
  const reservasOrdenadas = [...reservasDelDia].sort((a, b) =>
    dayjs(a.fecha).diff(dayjs(b.fecha))
  );

  const huecos = [];
  let horaActual = diaCompleto.inicio;

  for (const reserva of reservasOrdenadas) {
    const inicioReserva = dayjs(reserva.fecha);
    const finReserva = inicioReserva.add(reserva.duracion, "minute");

    if (horaActual.isBefore(inicioReserva)) {
      // Hay un hueco antes de esta reserva
      const duracionHueco = inicioReserva.diff(horaActual, "minute");
      if (duracionHueco > 0) {
        huecos.push({
          inicio: horaActual,
          fin: inicioReserva,
          duracion: duracionHueco,
        });
      }
    }

    // Avanzar al final de esta reserva (si es después de horaActual)
    if (finReserva.isAfter(horaActual)) {
      horaActual = finReserva;
    }
  }

  // Agregar hueco final (si hay)
  if (horaActual.isBefore(diaCompleto.fin)) {
    const duracionHueco = diaCompleto.fin.diff(horaActual, "minute");
    if (duracionHueco > 0) {
      huecos.push({
        inicio: horaActual,
        fin: diaCompleto.fin,
        duracion: duracionHueco,
      });
    }
  }

  return huecos;
};

// 🔹 Controlador principal: Crear una nueva reserva - VERSIÓN CON HUECOS
export const createReserva = async (req, res) => {
  try {
    const { barbero, servicio, fecha, hora, cliente } = req.body;

    if (!barbero || !servicio || !fecha || !hora || !cliente) {
      return res
        .status(400)
        .json({ message: "Todos los campos son obligatorios" });
    }

    console.log("🔄 createReserva INICIADO - NUEVA VERSIÓN CON HUECOS");
    console.log("📥 Datos recibidos:", {
      barbero,
      servicio,
      fecha,
      hora,
      cliente,
    });

    // ==============================
    // FECHA EN CHILE
    // ==============================
    const ahoraChile = dayjs().tz("America/Santiago");
    const fechaCompletaChile = dayjs.tz(
      `${fecha} ${formatHora(hora)}`,
      "YYYY-MM-DD HH:mm",
      "America/Santiago"
    );

    if (!fechaCompletaChile.isValid()) {
      return res.status(400).json({ message: "Fecha u hora inválida" });
    }

    const fechaCompletaUTC = fechaCompletaChile.utc();
    const fechaObj = fechaCompletaUTC.toDate();
    const diaSemana = fechaCompletaChile.day();

    console.log(
      "📅 Fecha Chile:",
      fechaCompletaChile.format("YYYY-MM-DD HH:mm")
    );
    console.log("📅 Día semana:", diaSemana, "(0=domingo, 1=lunes, etc.)");

    // ==============================
    // CLIENTE
    // ==============================
    const clienteDoc = await usuarioModel.findById(cliente);
    if (!clienteDoc)
      return res.status(404).json({ message: "Cliente no encontrado" });

    // ==============================
    // VALIDAR SÁBADO
    // ==============================
    const esBarbero = clienteDoc.rol === "barbero";
    const esSuscrito = clienteDoc.suscrito;

    if (diaSemana === 6 && !esBarbero) {
      const suscripcionActiva = await suscripcionModel.findOne({
        usuario: cliente,
        activa: true,
        fechaInicio: { $lte: new Date() },
        fechaFin: { $gte: new Date() },
      });

      if (!suscripcionActiva && !esSuscrito) {
        return res.status(403).json({
          message:
            "Las reservas de los sábados son solo para suscriptores activos o barberos",
        });
      }
    }

    // ==============================
    // BARBERO
    // ==============================
    const barberoDoc = await usuarioModel
      .findById(barbero)
      .populate("horariosDisponibles");
    if (!barberoDoc)
      return res.status(404).json({ message: "Barbero no encontrado" });

    console.log("💈 Barbero:", barberoDoc.nombre);

    // ==============================
    // SERVICIO + DURACIÓN REAL + INTERVALO MÍNIMO
    // ==============================
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
    // 🆕 NUEVO: Intervalo mínimo
    const intervaloMinimo = barberoServicio.intervaloMinimo || 15;

    console.log("⏱️ Duración del servicio:", duracionServicio, "minutos");
    console.log("📐 Intervalo mínimo:", intervaloMinimo, "minutos");
    console.log("💰 Precio:", precioServicio);
    console.log("✂️ Servicio:", nombreServicio);

    // ==============================
    // HORARIOS DEL DÍA
    // ==============================
    let horariosDelDia = barberoDoc.horariosDisponibles.filter(
      (h) => Number(h.diaSemana) === diaSemana
    );

    console.log("📅 Horarios para este día:", horariosDelDia.length);

    // Si no encuentra con diaSemana, prueba con dia
    if (horariosDelDia.length === 0) {
      console.log("DEBUG - Probando con .dia en lugar de .diaSemana");
      horariosDelDia = barberoDoc.horariosDisponibles.filter(
        (h) => Number(h.dia) === diaSemana
      );
    }

    if (horariosDelDia.length === 0) {
      return res.status(400).json({
        message: "El barbero no trabaja este día",
        diaSemana: diaSemana,
      });
    }

    // ==============================
    // EXCEPCIONES
    // ==============================
    const inicioDiaUTC = fechaCompletaChile.startOf("day").utc().toDate();
    const finDiaUTC = fechaCompletaChile.endOf("day").utc().toDate();

    const excepciones = await excepcionHorarioModel.find({
      barbero: barbero,
      fecha: { $gte: inicioDiaUTC, $lt: finDiaUTC },
    });

    const horasBloqueadas = excepciones
      .filter((e) => e.tipo === "bloqueo")
      .map((e) => dayjs(e.fecha).tz("America/Santiago").format("HH:mm"));

    console.log("🚫 Horas bloqueadas:", horasBloqueadas.length);

    // ==============================
    // RESERVAS EXISTENTES (EXCLUYENDO LA ACTUAL SI SE ESTÁ EDITANDO)
    // ==============================
    const reservasDelDia = await Reserva.find({
      barbero: barbero,
      fecha: {
        $gte: fechaCompletaChile.startOf("day").toDate(),
        $lt: fechaCompletaChile.endOf("day").toDate(),
      },
      estado: { $in: ["pendiente", "confirmada"] },
      // Opcional: excluir la reserva actual si se está editando
      // _id: { $ne: req.params.id }
    });

    console.log("📅 Reservas existentes:", reservasDelDia.length);

    // ==============================
    // NUEVA VALIDACIÓN: VERIFICAR SI LA HORA CABE EN ALGÚN HUECO
    // ==============================
    const horaFormateada = formatHora(hora);
    console.log("🔍 Validando hora:", horaFormateada);

    const inicioReserva = fechaCompletaChile;
    const finReserva = fechaCompletaChile.add(duracionServicio, "minute");

    console.log(
      `🕒 Servicio: ${inicioReserva.format("HH:mm")} - ${finReserva.format(
        "HH:mm"
      )}`
    );

    // 1. Verificar que no esté bloqueada
    if (horasBloqueadas.includes(horaFormateada)) {
      console.log("❌ Hora bloqueada por excepción");
      return res.status(400).json({
        message: "La hora está bloqueada por el barbero",
        hora: horaFormateada,
      });
    }

    // 2. Verificar que el inicio sea múltiplo del intervalo mínimo
    const minutosHora = horaAminutos(horaFormateada);
    if (minutosHora % intervaloMinimo !== 0) {
      console.log(
        `❌ Hora no es múltiplo del intervalo mínimo (${intervaloMinimo} min)`
      );
      return res.status(400).json({
        message: `La hora debe ser múltiplo de ${intervaloMinimo} minutos`,
        hora: horaFormateada,
        intervaloMinimo: intervaloMinimo,
      });
    }

    // 3. Verificar que el servicio completo quepa en algún horario del día
    let cabeEnAlgunHorario = false;
    let horarioValido = null;

    for (const horario of horariosDelDia) {
      const horarioInicio = dayjs.tz(
        `${fecha} ${horario.horaInicio}`,
        "YYYY-MM-DD HH:mm",
        "America/Santiago"
      );
      const horarioFin = dayjs.tz(
        `${fecha} ${horario.horaFin}`,
        "YYYY-MM-DD HH:mm",
        "America/Santiago"
      );

      if (
        inicioReserva.isSameOrAfter(horarioInicio) &&
        finReserva.isSameOrBefore(horarioFin)
      ) {
        cabeEnAlgunHorario = true;
        horarioValido = { inicio: horarioInicio, fin: horarioFin };
        console.log(
          `✅ Cabe en horario: ${horarioInicio.format(
            "HH:mm"
          )}-${horarioFin.format("HH:mm")}`
        );
        break;
      }
    }

    if (!cabeEnAlgunHorario) {
      console.log("❌ No cabe en ningún horario del barbero");
      return res.status(400).json({
        message: "El servicio no cabe en el horario del barbero",
        detalles: {
          horaInicio: inicioReserva.format("HH:mm"),
          horaFin: finReserva.format("HH:mm"),
          duracion: duracionServicio,
        },
      });
    }

    // 4. Calcular huecos disponibles en el horario válido
    const diaCompleto = {
      inicio: horarioValido.inicio,
      fin: horarioValido.fin,
    };

    const huecos = calcularHuecosDisponibles(reservasDelDia, diaCompleto);
    console.log(`📊 Huecos disponibles: ${huecos.length}`);

    // 5. Verificar si la reserva cabe en algún hueco
    let cabeEnAlgunHueco = false;

    for (const hueco of huecos) {
      // Verificar si el servicio completo cabe en este hueco
      const inicioCabe = inicioReserva.isSameOrAfter(hueco.inicio);
      const finCabe = finReserva.isSameOrBefore(hueco.fin);

      if (inicioCabe && finCabe) {
        cabeEnAlgunHueco = true;
        console.log(
          `✅ Cabe en hueco: ${hueco.inicio.format("HH:mm")}-${hueco.fin.format(
            "HH:mm"
          )}`
        );
        break;
      }
    }

    if (!cabeEnAlgunHueco) {
      console.log("❌ No cabe en ningún hueco disponible");

      // Mostrar información útil para debug
      const huecosInfo = huecos.map((h) => ({
        inicio: h.inicio.format("HH:mm"),
        fin: h.fin.format("HH:mm"),
        duracion: h.duracion,
      }));

      return res.status(400).json({
        message: "No hay espacio disponible para esta reserva",
        detalles: {
          horaSolicitada: horaFormateada,
          duracionServicio: duracionServicio,
          huecosDisponibles: huecosInfo,
        },
      });
    }

    // 6. No permitir horas pasadas para hoy
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

    console.log("✅ TODAS LAS VALIDACIONES PASADAS - Creando reserva...");

    // ==============================
    // CREAR RESERVA
    // ==============================
    const nuevaReserva = await Reserva.create({
      cliente,
      barbero,
      servicio,
      fecha: fechaObj,
      duracion: duracionServicio,
      estado: "pendiente",
      precio: precioServicio,
    });

    // ==============================
    // ACTUALIZAR SUSCRIPCIÓN
    // ==============================
    const suscripcion = await suscripcionModel.findOne({
      usuario: cliente,
      activa: true,
      fechaInicio: { $lte: new Date() },
      fechaFin: { $gte: new Date() },
    });

    if (
      suscripcion &&
      suscripcion.serviciosUsados < suscripcion.serviciosTotales
    ) {
      suscripcion.serviciosUsados += 1;
      await suscripcion.save();
      console.log("✅ Suscripción actualizada");
    }

    // ==============================
    // RESPUESTA
    // ==============================
    const respuesta = {
      ...nuevaReserva.toObject(),
      fechaChile: fechaCompletaChile.format("YYYY-MM-DD HH:mm"),
      duracion: duracionServicio,
      precio: precioServicio,
      nombreServicio: nombreServicio,
      horaFin: finReserva.format("HH:mm"),
      intervaloMinimo: intervaloMinimo,
    };

    console.log("✅ Reserva creada exitosamente:", respuesta._id);
    res.status(201).json(respuesta);

    // ==============================
    // EMAIL (en segundo plano)
    // ==============================
    try {
      await sendReservationEmail(clienteDoc.email, {
        nombreCliente: clienteDoc.nombre,
        nombreBarbero: barberoDoc.nombre,
        fecha: fechaCompletaChile.format("YYYY-MM-DD"),
        hora: horaFormateada,
        servicio: nombreServicio,
        duracion: duracionServicio,
        horaFin: finReserva.format("HH:mm"),
        intervaloMinimo: intervaloMinimo,
      });
      console.log("✅ Email enviado");
    } catch (emailError) {
      console.error("⚠️ Error enviando email:", emailError);
    }
  } catch (error) {
    console.error("❌ Error en createReserva:", error);
    const statusCode = error.message?.includes("sábado")
      ? 403
      : error.message?.includes("disponible") ||
        error.message?.includes("bloqueada") ||
        error.message?.includes("cabe") ||
        error.message?.includes("espacio") ||
        error.message?.includes("múltiplo")
      ? 400
      : 500;

    res.status(statusCode).json({
      message: error.message || "Error al crear la reserva",
    });
  }
};

// 🔹 Función auxiliar: Convertir HH:mm a minutos
function horaAminutos(hora) {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

export const getReservas = async (req, res) => {
  try {
    const reservas = await Reserva.find();
    res.json(reservas);
  } catch (error) {}
};

export const getReservasByUserId = async (req, res) => {
  try {
    // el id lo sacas del token (req.user.id) en lugar de params
    const userId = req.usuario.id; // este viene del token JWT

    // buscar todas las reservas de ese usuario
    const reservas = await Reserva.find({ cliente: userId })
      .populate("barbero", "nombre apellido suscrito")
      .populate("servicio", "nombre duracion precio")
      .sort({ fecha: 1 }); // ordenadas por fecha

    res.json({ reservas });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getReservasByBarberId = async (req, res) => {
  try {
    const barberId = req.usuario.id;
    const hoy = new Date();
    const inicio = new Date(hoy.setHours(0, 0, 0, 0));
    const fin = new Date(hoy.setHours(23, 59, 59, 999));

    const reservas = await Reserva.find({
      barbero: barberId,
      fecha: { $gte: inicio, $lte: fin },
    })
      .populate("cliente", "nombre apellido telefono") // Trae solo nombre y apellido del cliente
      .populate("servicio", "nombre") // Trae solo nombre del servicio
      .sort({ fecha: 1 }); // Ordena por fecha ascendente
    console.log(reservas);
    return res.json({ reservas });
  } catch (error) {
    console.error("Error al obtener reservas por barbero:", error);
    return res.status(500).json({ message: "Error al obtener reservas" });
  }
};

export const postDeleteReserva = async (req, res) => {
  try {
    const { id } = req.params;
    console.log("📌 Cancelando reserva con ID:", id);

    const existeReserva = await Reserva.findById(id);
    if (!existeReserva) {
      return res.status(404).json({
        message: "No se ha encontrado la reserva.",
      });
    }

    console.log("✅ Reserva encontrada:", existeReserva);

    console.log("🔻 Puntos restados al usuario");

    // Eliminar la reserva
    await Reserva.findByIdAndUpdate(id, {
      estado: "cancelada",
      motivoCancelacion: "Cancelada por el usuario",
    });
    console.log("✅ Reserva eliminada");

    // ────────────────────────────────
    // Notificaciones
    // ────────────────────────────────
    const notificaciones = await notificacionModel
      .find({
        barberoId: existeReserva.barbero,
        fecha: existeReserva.fecha,
        enviado: false,
      })
      .populate("usuarioId");

    await Promise.all(
      notificaciones.map(async (noti) => {
        if (noti.usuarioId?.email) {
          await sendWaitlistNotificationEmail(noti.usuarioId.email, {
            nombreCliente: noti.usuarioId.nombre,
            nombreBarbero: "Nombre del Barbero",
            fecha: noti.fecha.toLocaleDateString(),
            hora: noti.fecha.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          });
        }
        noti.enviado = true;
        await noti.save();
      })
    );

    return res.status(200).json({
      message:
        "Reserva eliminada, puntos actualizados y notificaciones enviadas",
      reserva: existeReserva,
      notificacionesEnviadas: notificaciones.length,
    });
  } catch (error) {
    console.error("❌ Error al eliminar reserva:", error);
    return res.status(500).json({
      message: "Error del servidor al eliminar la reserva.",
    });
  }
};

export const getReservasActivas = async (req, res) => {
  try {
    const { userId } = req.params;

    const usuario = await usuarioModel.findById(userId);
    if (!usuario)
      return res.status(404).json({ message: "No se encuentró el usuario." });

    const now = new Date();

    const reservasActivas = await Reserva.countDocuments({
      cliente: userId,
      estado: { $in: ["pendiente", "confirmada"] },
      fecha: { $gte: now }, // 👈 SOLO RESERVAS FUTURAS
    });

    res.json({
      success: true,
      reservasActivas,
      maxReservas: usuario.maxReservas,
      plan: usuario.plan,
      puedeReservar: reservasActivas < usuario.maxReservas,
      restantes: Math.max(usuario.maxReservas - reservasActivas, 0),
    });
  } catch (error) {
    console.error("Error al obtener reservas activas:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener reservas activas",
    });
  }
};
export const getReservasPorFechaBarbero = async (req, res) => {
  try {
    const { fecha } = req.query;
    const barberoId = req.usuario.id;

    const inicioDia = new Date(fecha + "T00:00:00");
    const finDia = new Date(fecha + "T23:59:59");

    // 1. Obtener todas las reservas del día
    const reservas = await Reserva.find({
      barbero: barberoId,
      fecha: { $gte: inicioDia, $lte: finDia },
    })
      .populate("cliente", "nombre apellido telefono")
      .populate("servicio", "nombre")
      .sort({ fecha: 1 });

    // 2. Procesar cada reserva para incluir posición dentro de la suscripción
    const reservasConInfo = await Promise.all(
      reservas.map(async (reserva) => {
        const clienteId = reserva.cliente?._id;
        if (!clienteId) return reserva;

        // Buscar suscripción activa para esta fecha
        const sus = await suscripcionModel.findOne({
          usuario: clienteId,
          activa: true,
          fechaInicio: { $lte: reserva.fecha },
          fechaFin: { $gte: reserva.fecha },
        });

        if (!sus) {
          return {
            ...reserva.toObject(),
            suscripcion: null,
          };
        }

        // Reservas que el cliente ha hecho dentro del periodo de la suscripción
        const reservasDelCliente = await Reserva.find({
          cliente: clienteId,
          fecha: { $gte: sus.fechaInicio, $lte: reserva.fecha },
        }).sort({ fecha: 1 });

        // Posición EXACTA en la suscripción (1, 2, 3…)
        const posicion =
          reservasDelCliente.findIndex(
            (r) => r._id.toString() === reserva._id.toString()
          ) + 1;

        return {
          ...reserva.toObject(),
          suscripcion: {
            posicion,
            limite: sus.serviciosTotales,
          },
        };
      })
    );

    res.json({ reservas: reservasConInfo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener reservas por fecha" });
  }
};
