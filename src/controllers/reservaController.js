import Reserva from "../models/reserva.model.js";
import excepcionHorarioModel from "../models/excepcionHorario.model.js";
import usuarioModel from "../models/usuario.model.js";
import suscripcionModel from "../models/suscripcion.model.js";
import barberoServicioModel from "../models/barberoServicio.model.js";
import empresaModel from "../models/empresa.model.js";
import { formatHora } from "../utils/horas.js";
import {
  sendGuestReservationEmail,
  sendReservationEmail,
} from "./mailController.js";
import accesTokenModel from "../models/accesToken.model.js";
import crypto from "crypto";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore.js";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

/* =============================
   UTIL: calcular huecos (debug)
============================= */
const calcularHuecosDisponibles = (reservas, dia) => {
  const ordenadas = [...reservas].sort((a, b) =>
    dayjs(a.fecha).diff(dayjs(b.fecha)),
  );

  const huecos = [];
  let cursor = dia.inicio;

  for (const r of ordenadas) {
    const ini = dayjs(r.fecha).tz("America/Santiago");
    const fin = ini.add(r.duracion, "minute");

    if (fin.isBefore(dia.inicio) || ini.isAfter(dia.fin)) continue;

    const iniAjustado = ini.isBefore(dia.inicio) ? dia.inicio : ini;

    if (cursor.isBefore(iniAjustado)) {
      huecos.push({
        inicio: cursor,
        fin: iniAjustado,
        duracion: iniAjustado.diff(cursor, "minute"),
      });
    }

    if (fin.isAfter(cursor)) {
      cursor = fin.isAfter(dia.fin) ? dia.fin : fin;
    }
  }

  if (cursor.isBefore(dia.fin)) {
    huecos.push({
      inicio: cursor,
      fin: dia.fin,
      duracion: dia.fin.diff(cursor, "minute"),
    });
  }

  return huecos;
};

/* =============================
   CONTROLLER
============================= */
export const createReserva = async (req, res) => {
  try {
    const empresa = req.usuario?.empresaId;
    const rolUsuario = req.usuario?.rol;

    const { barbero, servicio, fecha, hora } = req.body;
    const cliente = req.usuario?.id;

    if (!empresa || !barbero || !servicio || !fecha || !hora) {
      return res.status(400).json({ message: "Datos incompletos" });
    }

    /* =============================
       VALIDAR EMPRESA
    ============================== */
    const empresaDoc = await empresaModel.findById(empresa);
    if (!empresaDoc) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    /* =============================
       BARBERO
    ============================== */
    const barberoDoc = await usuarioModel
      .findOne({
        _id: barbero,
        empresa,
        rol: "barbero",
        estado: "activo",
      })
      .populate("horariosDisponibles");

    if (!barberoDoc) {
      return res.status(403).json({
        message: "El barbero no pertenece a esta empresa",
      });
    }

    /* =============================
       CLIENTE
    ============================== */
    const clienteDoc = await usuarioModel.findOne({
      _id: cliente,
      empresa,
      estado: "activo",
    });

    if (!clienteDoc) {
      return res.status(404).json({
        message: "Cliente no pertenece a esta empresa",
      });
    }

    /* =============================
       FECHA (CHILE)
    ============================== */
    const ahoraChile = dayjs().tz("America/Santiago");

    const inicioReservaChile = dayjs.tz(
      `${fecha} ${formatHora(hora)}`,
      "YYYY-MM-DD HH:mm",
      "America/Santiago",
    );

    if (!inicioReservaChile.isValid()) {
      return res.status(400).json({ message: "Fecha u hora inválida" });
    }

    const inicioReservaUTC = inicioReservaChile.utc();
    const diaSemana = inicioReservaChile.day();

    /* =============================
       SÁBADOS / SUSCRIPCIÓN
    ============================== */
    if (diaSemana === 6 && rolUsuario !== "barbero") {
      const suscripcionActiva = await suscripcionModel.findOne({
        usuario: cliente,
        activa: true,
        fechaInicio: { $lte: new Date() },
        fechaFin: { $gte: new Date() },
      });

      if (!suscripcionActiva) {
        return res.status(403).json({
          message:
            "Las reservas del sábado son solo para suscriptores o barberos",
        });
      }
    }

    /* =============================
       SERVICIO
    ============================== */
    const barberoServicio = await barberoServicioModel
      .findOne({ barbero, servicio, activo: true })
      .populate("servicio");

    if (!barberoServicio) {
      return res.status(400).json({
        message: "El servicio no está disponible para este barbero",
      });
    }

    const {
      duracion: duracionServicio,
      precio: precioServicio,
      intervaloMinimo = 15,
    } = barberoServicio;

    const nombreServicio = barberoServicio.servicio.nombre;
    const finReservaChile = inicioReservaChile.add(duracionServicio, "minute");

    /* =============================
       HORARIOS
    ============================== */
    const horariosDelDia = barberoDoc.horariosDisponibles.filter(
      (h) => Number(h.diaSemana) === diaSemana,
    );

    if (!horariosDelDia.length) {
      return res.status(400).json({
        message: "El barbero no trabaja este día",
      });
    }

    let bloqueValido = null;

    for (const h of horariosDelDia) {
      const ini = dayjs.tz(
        `${fecha} ${h.horaInicio}`,
        "YYYY-MM-DD HH:mm",
        "America/Santiago",
      );
      const fin = dayjs.tz(
        `${fecha} ${h.horaFin}`,
        "YYYY-MM-DD HH:mm",
        "America/Santiago",
      );

      if (
        inicioReservaChile.isSameOrAfter(ini) &&
        finReservaChile.isSameOrBefore(fin)
      ) {
        bloqueValido = { inicio: ini, fin };
        break;
      }
    }

    if (!bloqueValido) {
      return res.status(400).json({
        message: "El servicio no cabe en el horario del barbero",
      });
    }

    /* =============================
       EXCEPCIONES
    ============================== */
    const inicioDiaUTC = inicioReservaChile.startOf("day").utc().toDate();
    const finDiaUTC = inicioReservaChile.endOf("day").utc().toDate();

    const excepciones = await excepcionHorarioModel.find({
      barbero,
      fecha: { $gte: inicioDiaUTC, $lt: finDiaUTC },
      tipo: "bloqueo",
    });

    const horaFormateada = formatHora(hora);

    const horasBloqueadas = excepciones.map((e) =>
      dayjs(e.fecha).tz("America/Santiago").format("HH:mm"),
    );

    if (horasBloqueadas.includes(horaFormateada)) {
      return res.status(400).json({
        message: "La hora está bloqueada por el barbero",
      });
    }

    /* =============================
       INTERVALO
    ============================== */
    if (horaAminutos(horaFormateada) % intervaloMinimo !== 0) {
      return res.status(400).json({
        message: `La hora debe ser múltiplo de ${intervaloMinimo} minutos`,
      });
    }

    /* =============================
       COLISIONES
    ============================== */
    const reservasDelDia = await Reserva.find({
      empresa,
      barbero,
      fecha: { $gte: inicioDiaUTC, $lt: finDiaUTC },
      estado: { $in: ["pendiente", "confirmada"] },
    });

    for (const r of reservasDelDia) {
      const ini = dayjs(r.fecha).tz("America/Santiago");
      const fin = ini.add(r.duracion, "minute");

      if (inicioReservaChile.isBefore(fin) && finReservaChile.isAfter(ini)) {
        return res.status(400).json({
          message: "La hora ya está ocupada",
        });
      }
    }

    /* =============================
       HORAS PASADAS
    ============================== */
    if (
      inicioReservaChile.isSame(ahoraChile, "day") &&
      inicioReservaChile.isBefore(ahoraChile.add(30, "minute"))
    ) {
      return res.status(400).json({
        message:
          "No se pueden reservar horas pasadas o con menos de 30 minutos",
      });
    }

    /* =============================
       CREAR RESERVA
    ============================== */
    const reserva = await Reserva.create({
      empresa,
      cliente,
      barbero,
      servicio,
      fecha: inicioReservaUTC.toDate(),
      duracion: duracionServicio,
      precio: precioServicio,
      estado: "pendiente",
    });

    /* =============================
       TOKEN INVITADO
    ============================== */
    let cancelToken = null;

    if (req.crearTokenCancelacion) {
      cancelToken = crypto.randomBytes(32).toString("hex");

      await accesTokenModel.create({
        usuario: cliente,
        reserva: reserva._id,
        empresa: empresa, // 👈 agregar esto
        token: cancelToken,
        tipo: "reserva",
        expiraEn: inicioReservaUTC.subtract(3, "hour").toDate(),
      });
    }

    /* =============================
       RESPUESTA
    ============================== */
    res.status(201).json({
      ...reserva.toObject(),
      fechaChile: inicioReservaChile.format("YYYY-MM-DD HH:mm"),
      horaFin: finReservaChile.format("HH:mm"),
      nombreServicio,
      intervaloMinimo,
      cancelToken,
    });

    /* =============================
       EMAIL (CLAVE)
    ============================== */
    if (req.crearTokenCancelacion && cancelToken) {
      // 👉 INVITADO
      sendGuestReservationEmail(clienteDoc.email, {
        nombreCliente: clienteDoc.nombre,
        nombreBarbero: barberoDoc.nombre,
        fecha,
        hora: horaFormateada,
        servicio: nombreServicio,
        duracion: duracionServicio,
        horaFin: finReservaChile.format("HH:mm"),
        cancelUrl: `www.agendafonfach.cl/${empresaDoc.slug}/cancelar-reserva-invitado?token=${cancelToken}`,
      }).catch(console.error);
    } else {
      // 👉 USUARIO REGISTRADO
      sendReservationEmail(clienteDoc.email, {
        nombreCliente: clienteDoc.nombre,
        nombreBarbero: barberoDoc.nombre,
        fecha,
        hora: horaFormateada,
        servicio: nombreServicio,
        duracion: duracionServicio,
        horaFin: finReservaChile.format("HH:mm"),
      }).catch(console.error);
    }
  } catch (error) {
    console.error("❌ Error createReserva:", error);
    res.status(500).json({ message: "Error al crear la reserva" });
  }
};

/* =============================
   UTIL
============================= */
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
      .populate("cliente", "nombre apellido telefono")
      .populate("servicio", "nombre")
      .sort({ fecha: 1 });

    return res.json({ reservas });
  } catch (error) {
    console.error(error);
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
        await Promise.all(
          notificaciones.map(async (noti) => {
            const usuario = noti.usuarioId;

            if (!usuario?.telefono) {
              console.log("⚠️ Usuario sin teléfono, se omite");
              return;
            }

            const telefono = usuario.telefono.startsWith("+")
              ? usuario.telefono
              : `+${usuario.telefono}`;

            const fecha = noti.fecha.toLocaleDateString("es-CL");
            const hora = noti.fecha.toLocaleTimeString("es-CL", {
              hour: "2-digit",
              minute: "2-digit",
            });

            const mensaje = `💈 *Hora liberada*\n
Hola ${usuario.nombre} 👋

Se liberó una hora que te interesaba:

📅 *Fecha:* ${fecha}
🕒 *Hora:* ${hora}

👉 Entra ahora y resérvala antes que otro:
${process.env.FRONTEND_URL}/reservar

✂️ La Santa Barbería`;

            try {
              await WhatsAppService.client.messages.create({
                from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
                to: `whatsapp:${telefono}`,
                body: mensaje,
              });

              noti.enviado = true;
              await noti.save();

              console.log(`✅ WhatsApp enviado a ${usuario.nombre}`);
            } catch (err) {
              console.error(
                `❌ Error enviando WhatsApp a ${usuario.nombre}:`,
                err.message,
              );
            }
          }),
        );

        noti.enviado = true;
        await noti.save();
      }),
    );

    return res.status(200).json({
      message:
        "Reserva cancelada, te enviaremos un mail confirmando la cancelación de tu hora.",
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
      estado: { $ne: "cancelada" }, // 🔥 CLAVE
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
            (r) => r._id.toString() === reserva._id.toString(),
          ) + 1;

        return {
          ...reserva.toObject(),
          suscripcion: {
            posicion,
            limite: sus.serviciosTotales,
          },
        };
      }),
    );

    res.json({ reservas: reservasConInfo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener reservas por fecha" });
  }
};
