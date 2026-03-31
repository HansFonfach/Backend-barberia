import Reserva from "../models/reserva.model.js";
import excepcionHorarioModel from "../models/excepcionHorario.model.js";
import usuarioModel from "../models/usuario.model.js";
import suscripcionModel from "../models/suscripcion.model.js";
import barberoServicioModel from "../models/barberoServicio.model.js";
import empresaModel from "../models/empresa.model.js";
import { formatHora } from "../utils/horas.js";
import {
  sendCancelReservationEmail,
  sendGuestReservationEmail,
  sendProfesionalCancelReservationEmail,
  sendProfesionalNewReservationEmail,
  sendReservationEmail,
  sendWaitlistNotificationEmail,
} from "./mailController.js";
import accesTokenModel from "../models/accesToken.model.js";
import crypto from "crypto";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore.js";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter.js";
import notificacionModel from "../models/notificacion.Model.js";
import { actualizarClienteServicioStats } from "../helpers/actualizarClienteServicioStats.js";
import WhatsappService from "../services/whatsappService.js";

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
    const cliente = req.body.cliente || req.usuario?.id;

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
       LÍMITE DE DÍAS CALENDARIO
    ============================== */
    if (rolUsuario !== "barbero") {
      const diasPermitidos = empresaDoc.diasMostradosCalendario ?? 15;
      const limiteNormal = ahoraChile.add(diasPermitidos, "day").endOf("day");
      let limiteDias = limiteNormal;

      if (empresaDoc.permiteSuscripcion) {
        const suscripcionCliente = await suscripcionModel.findOne({
          usuario: cliente,
          activa: true,
          fechaInicio: { $lte: new Date() },
          fechaFin: { $gte: new Date() },
        });

        if (suscripcionCliente) {
          const limiteSuscripcion = dayjs(suscripcionCliente.fechaInicio)
            .tz("America/Santiago")
            .add(31, "day")
            .endOf("day");

          limiteDias = limiteSuscripcion.isAfter(limiteNormal)
            ? limiteSuscripcion
            : limiteNormal;
        }

        if (inicioReservaChile.isAfter(limiteDias)) {
          return res.status(400).json({
            message: suscripcionCliente
              ? "No puedes reservar más allá de los 31 días de tu suscripción"
              : `Solo puedes reservar hasta ${diasPermitidos} días desde hoy`,
          });
        }
      } else {
        if (inicioReservaChile.isAfter(limiteDias)) {
          return res.status(400).json({
            message: `Solo puedes reservar hasta ${diasPermitidos} días desde hoy`,
          });
        }
      }
    }

    /* =============================
       SÁBADOS / SUSCRIPCIÓN
    ============================== */
    if (diaSemana === 6 && rolUsuario !== "barbero") {
      if (empresaDoc.permiteSuscripcion) {
        const suscripcionActiva = await suscripcionModel.findOne({
          usuario: cliente,
          activa: true,
          fechaInicio: { $lte: inicioReservaUTC.toDate() },
          fechaFin: { $gte: inicioReservaUTC.toDate() },
        });

        if (!suscripcionActiva) {
          // Buscar si tiene una suscripción vencida
          const suscripcionVencida = await suscripcionModel
            .findOne({
              usuario: cliente,
            })
            .sort({ fechaFin: -1 }); // la más reciente

          if (suscripcionVencida) {
            const fechaVencimiento = dayjs(suscripcionVencida.fechaFin)
              .tz("America/Santiago")
              .format("DD/MM/YYYY");

            return res.status(403).json({
              message: `Tu suscripción venció el ${fechaVencimiento}, por lo que no puedes reservar este sábado`,
            });
          }

          return res.status(403).json({
            message:
              "Las reservas del sábado son solo para suscriptores o barberos",
          });
        }
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
    const inicioBusqueda = inicioReservaChile
      .startOf("day")
      .subtract(4, "hour")
      .utc()
      .toDate();
    const finBusqueda = inicioReservaChile
      .endOf("day")
      .add(4, "hour")
      .utc()
      .toDate();

    const excepciones = await excepcionHorarioModel.find({
      barbero,
      fecha: { $gte: inicioBusqueda, $lt: finBusqueda },
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
      fecha: { $gte: inicioBusqueda, $lt: finBusqueda },
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
    if (rolUsuario !== "barbero") {
      // ✅ correcto de verdad:
      const limiteMinimoSeguro = ahoraChile.add(30, "minute");

      if (
        inicioReservaChile.isSame(ahoraChile, "day") &&
        inicioReservaChile.isBefore(limiteMinimoSeguro)
      ) {
        return res.status(400).json({
          message:
            "No se pueden reservar horas pasadas o con menos de 30 minutos",
        });
      }
    }

    /* =============================
   CALCULAR ABONO
============================== */

    const requiereAbono = empresaDoc.pagos?.requiereAbono === true;
    let abonoData = { requerido: false, monto: 0 };

    if (requiereAbono) {
      const tipoAbono = empresaDoc.pagos.tipoAbono || "fijo";
      const monto =
        tipoAbono === "porcentaje"
          ? Math.round(
              (precioServicio * empresaDoc.pagos.porcentajeAbono) / 100,
            )
          : empresaDoc.pagos.montoAbonoFijo;

      abonoData = {
        requerido: true,
        monto,
        tipoCalculo: tipoAbono,
        porcentajeAplicado:
          tipoAbono === "porcentaje" ? empresaDoc.pagos.porcentajeAbono : 0,
        estado: "pendiente",
        metodo: "transferencia",
      };
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
      abono: abonoData, // 👈
    });

    await actualizarClienteServicioStats({
      clienteId: reserva.cliente,
      servicioId: reserva.servicio,
      empresaId: reserva.empresa,
      fechaReserva: reserva.fecha,
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
        empresa: empresa,
        token: cancelToken,
        tipo: "reserva",
        expiraEn: inicioReservaUTC.add(1, "year").toDate(),
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
      datosPago: requiereAbono
        ? {
            ...empresaDoc.pagos.transferencia.toObject(),
            telefonoEmpresa: empresaDoc.telefono || null,
          }
        : null,
    });

    /* =============================
       EMAILS
    ============================== */
    const emailData = {
      nombreCliente: clienteDoc.nombre,
      nombreBarbero: barberoDoc.nombre,
      fecha,
      hora: horaFormateada,
      servicio: nombreServicio,
      duracion: duracionServicio,
      horaFin: finReservaChile.format("HH:mm"),
      direccion: empresaDoc.direccion,
    };

    // ✅ Solo enviar emails si la hora NO ha pasado
    const limiteMinimoSeguro = ahoraChile.add(30, "minute");

    const horaNoValidaParaEmail =
      inicioReservaChile.isBefore(limiteMinimoSeguro);

    if (!horaNoValidaParaEmail) {
      if (req.crearTokenCancelacion && cancelToken) {
        sendGuestReservationEmail(clienteDoc.email, {
          ...emailData,
          instrucciones: barberoServicio.servicio.instrucciones ?? null,
          cancelUrl: `www.agendafonfach.cl/${empresaDoc.slug}/cancelar-reserva-invitado?token=${cancelToken}`,
          permiteCancelacion:
            empresaDoc.politicaCancelacion?.permiteCancelacion ?? true,
          horasLimite: empresaDoc.politicaCancelacion?.horasLimite ?? 24,
        }).catch(console.error);
      } else {
        sendReservationEmail(clienteDoc.email, {
          ...emailData,
          instrucciones: barberoServicio.servicio.instrucciones ?? null,
        }).catch(console.error);
      }
    }

    // Email al barbero — siempre, independiente de si la hora pasó
    if (empresaDoc?.envioNotificacionReserva && barberoDoc?.email) {
      sendProfesionalNewReservationEmail(barberoDoc.email, {
        ...emailData,
        nombreBarbero: barberoDoc.nombre,
      }).catch(console.error);
    }

    if (empresaDoc?.envioNotificacionReserva && barberoDoc?.telefono) {
      WhatsappService.enviarNotificacionProfesional({
        telefono: barberoDoc.telefono,
        nombreProfesional: barberoDoc.nombre,
        nombreCliente: clienteDoc.nombre,
        fecha,
        hora: horaFormateada,
        servicio: nombreServicio,
        plantilla: "notificacion_reserva", // ← esto
      }).catch((err) =>
        console.error(`❌ Error WhatsApp barbero nueva reserva:`, err.message),
      );
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
    const { motivo } = req.body;

    const existeReserva = await Reserva.findById(id)
      .populate("cliente")
      .populate("barbero", "nombre email telefono")
      .populate("servicio");

    if (!existeReserva) {
      return res
        .status(404)
        .json({ message: "No se ha encontrado la reserva." });
    }

    if (existeReserva.estado === "cancelada") {
      return res
        .status(400)
        .json({ message: "La reserva ya se encuentra cancelada." });
    }

    // 1️⃣ Cargar empresa (movido arriba para usar en política)
    const empresaDoc = await empresaModel.findById(existeReserva.empresa);

    // 2️⃣ Validar política de cancelación (solo para clientes e invitados)
    const rolUsuario = req.usuario?.rol;
    const esClienteOInvitado = !rolUsuario || rolUsuario === "cliente";

    if (esClienteOInvitado) {
      const politica = empresaDoc?.politicaCancelacion;

      if (politica?.permiteCancelacion === false) {
        return res.status(403).json({
          message:
            politica.mensajePolitica ||
            "Esta empresa no permite cancelaciones.",
        });
      }

      if (politica?.horasLimite > 0) {
        const ahoraChile = dayjs().tz("America/Santiago");
        const fechaReservaChile = dayjs(existeReserva.fecha).tz(
          "America/Santiago",
        );

        const limiteCancelacion = fechaReservaChile.subtract(
          politica.horasLimite,
          "hour",
        );

        // 🔥 CLAVE: comparar fechas directamente (más limpio)
        if (ahoraChile.isAfter(limiteCancelacion)) {
          return res.status(403).json({
            message:
              politica.mensajePolitica ||
              `No puedes cancelar con menos de ${politica.horasLimite} horas de anticipación.`,
          });
        }
      }
    }

    // 3️⃣ Cancelar reserva
    existeReserva.estado = "cancelada";
    existeReserva.motivoCancelacion = motivo || "Cancelada por el usuario";
    await existeReserva.save();

    // 4️⃣ Datos compartidos para emails
    const emailCliente =
      existeReserva.cliente?.email || existeReserva.invitado?.email;
    const nombreCliente =
      existeReserva.cliente?.nombre || existeReserva.invitado?.nombre;

    const fechaReserva = new Date(existeReserva.fecha);
    const fechaFormateada = fechaReserva.toLocaleDateString("es-CL", {
      timeZone: "America/Santiago",
    });
    const horaFormateada = fechaReserva.toLocaleTimeString("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Santiago",
    });

    const emailData = {
      nombreCliente,
      nombreBarbero: existeReserva.barbero?.nombre || "Tu barbero",
      fecha: fechaFormateada,
      hora: horaFormateada,
      servicio: existeReserva.servicio?.nombre || "Servicio",
      motivo: existeReserva.motivoCancelacion,
      direccion: empresaDoc?.direccion || null, // ← agregar esto
    };

    // 5️⃣ Email al cliente
    if (emailCliente) {
      sendCancelReservationEmail(emailCliente, emailData).catch((error) =>
        console.error(
          "❌ Error enviando correo de cancelación:",
          error.message,
        ),
      );
    }

    // 6️⃣ Email al barbero — solo si la empresa tiene activada la notificación
    if (empresaDoc?.envioNotificacionReserva && existeReserva.barbero?.email) {
      sendProfesionalCancelReservationEmail(
        existeReserva.barbero.email,
        emailData,
      ).catch((error) =>
        console.error(
          "❌ Error enviando notificación al barbero:",
          error.message,
        ),
      );
    }

    if (existeReserva.barbero?.telefono) {
      WhatsappService.enviarNotificacionProfesional({
        telefono: existeReserva.barbero.telefono,
        nombreProfesional: existeReserva.barbero.nombre,
        nombreCliente,
        fecha: fechaFormateada,
        hora: horaFormateada,
        servicio: existeReserva.servicio?.nombre || "Servicio",
      }).catch((err) =>
        console.error(`❌ Error WhatsApp barbero:`, err.message),
      );
    }

    // 7️⃣ Notificar lista de espera
    const fechaInicio = new Date(existeReserva.fecha);
    fechaInicio.setSeconds(0, 0);
    const fechaFin = new Date(existeReserva.fecha);
    fechaFin.setSeconds(59, 999);

    const notificaciones = await notificacionModel
      .find({
        barberoId: existeReserva.barbero._id,
        fecha: { $gte: fechaInicio, $lte: fechaFin },
        enviado: false,
      })
      .populate("usuarioId")
      .populate("barberoId");

    await Promise.all(
      notificaciones.map(async (noti) => {
        const barbero = noti.barberoId;
        const fechaNoti = new Date(noti.fecha);

        const fechaFormateadaNoti = fechaNoti.toLocaleDateString("es-CL", {
          timeZone: "America/Santiago",
        });
        const horaFormateadaNoti = fechaNoti.toLocaleTimeString("es-CL", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "America/Santiago",
        });

        // ✅ INVITADO: usar emailInvitado directamente
        if (noti.esInvitado && noti.emailInvitado) {
          try {
            const result = await sendWaitlistNotificationEmail(
              noti.emailInvitado,
              {
                nombreCliente: "Cliente",
                nombreBarbero: barbero?.nombre || "Tu barbero",
                fecha: fechaFormateadaNoti,
                hora: horaFormateadaNoti,
              },
            );

            if (!result?.error) {
              noti.enviado = true;
              await noti.save();
            }
          } catch (err) {
            console.error(
              `❌ Error notificando invitado ${noti.emailInvitado}:`,
              err.message,
            );
          }
          return;
        }

        // ✅ USUARIO REGISTRADO
        const usuario = noti.usuarioId;
        if (!usuario?.email) return;

        try {
          const result = await sendWaitlistNotificationEmail(usuario.email, {
            nombreCliente: usuario.nombre,
            nombreBarbero: barbero?.nombre || "Tu barbero",
            fecha: fechaFormateadaNoti,
            hora: horaFormateadaNoti,
          });

          if (result?.error) {
            console.error(
              `❌ Error enviando notificación a ${usuario.email}:`,
              result.error,
            );
            return;
          }

          noti.enviado = true;
          await noti.save();
        } catch (err) {
          console.error(
            `❌ Error enviando notificación a ${usuario.nombre}:`,
            err.message,
          );
        }
      }),
    );

    return res.status(200).json({
      message: "Reserva cancelada correctamente",
      notificacionesEnviadas: notificaciones.length,
    });
  } catch (error) {
    console.error("❌ Error al eliminar reserva:", error);
    return res
      .status(500)
      .json({ message: "Error del servidor al eliminar la reserva." });
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
      estado: { $ne: "cancelada" },
    })
      .populate("cliente", "nombre apellido telefono")
      .populate("servicio", "nombre duracion")
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

        // Reservas del cliente dentro del periodo de suscripción
        // hasta e incluyendo la reserva actual, sin canceladas
        const reservasDelCliente = await Reserva.find({
          cliente: clienteId,
          fecha: { $gte: sus.fechaInicio, $lte: reserva.fecha },
          estado: { $ne: "cancelada" },
        }).sort({ fecha: 1 });

        // Acumular servicios usados hasta esta reserva (inclusive)
        // 120 min = corte + barba = 2 servicios, resto = 1 servicio
        let serviciosAcumulados = 0;
        for (const r of reservasDelCliente) {
          const peso = r.duracion >= 120 ? 2 : 1;
          serviciosAcumulados += peso;
          if (r._id.toString() === reserva._id.toString()) break;
        }

        return {
          ...reserva.toObject(),
          suscripcion: {
            posicion: serviciosAcumulados,
            limite: sus.serviciosTotales,
            esDobleServicio: reserva.duracion >= 120,
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

export const updateMarcarNoAsistioReserva = async (req, res) => {
  try {
    const { id } = req.params;

    const reservaActualizada = await Reserva.findByIdAndUpdate(
      id,
      { estado: "no_asistio" },
      { new: true },
    );

    if (!reservaActualizada) {
      return res.status(404).json({
        message: "No se ha encontrado la reserva.",
      });
    }

    // ✅ Restar 10 puntos al cliente (mínimo 0)
    await usuarioModel.findByIdAndUpdate(reservaActualizada.cliente, {
      $inc: { puntos: -10 },
    });

    return res.status(200).json({
      message: "Reserva marcada como no asistió.",
      reserva: reservaActualizada,
    });
  } catch (error) {
    console.error("❌ Error al actualizar estado de reserva", error);
    return res.status(500).json({
      message: "Error del servidor al actualizar la reserva.",
    });
  }
};

export const responderConfirmacionAsistencia = async (req, res) => {
  try {
    const { token } = req.params;
    const { respuesta } = req.query; // "confirma" o "cancela"

    // Validar respuesta
    if (!["confirma", "cancela"].includes(respuesta)) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/confirmacion-resultado?error=invalido`,
      );
    }

    // Buscar reserva por token
    const reserva = await Reserva.findOne({
      "confirmacionAsistencia.token": token,
    })
      .populate("cliente", "nombre email telefono")
      .populate("barbero", "nombre apellido email")
      .populate("servicio", "nombre")
      .populate("empresa");

    if (!reserva) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/confirmacion-resultado?error=token`,
      );
    }

    // Ya respondió antes
    if (reserva.confirmacionAsistencia.respondida) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/confirmacion-resultado?respuesta=${reserva.confirmacionAsistencia.respuesta}&ya_respondida=true`,
      );
    }

    // La reserva ya ocurrió
    if (reserva.fecha < new Date()) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/confirmacion-resultado?error=expirado`,
      );
    }

    // Marcar como respondida
    reserva.confirmacionAsistencia.respondida = true;
    reserva.confirmacionAsistencia.respuesta = respuesta;
    reserva.confirmacionAsistencia.respondidaEn = new Date();
    reserva.confirmacionUsuario = true;
    reserva.fechaConfirmacion = new Date();

    // ── CONFIRMA ──────────────────────────────────────────
    if (respuesta === "confirma") {
      reserva.estado = "confirmada";
      await reserva.save();

      return res.redirect(
        `${process.env.FRONTEND_URL}/confirmacion-resultado?respuesta=confirma`,
      );
    }

    // ── CANCELA ───────────────────────────────────────────
    if (respuesta === "cancela") {
      // Validar política de cancelación
      const empresaDoc = reserva.empresa;
      const politica = empresaDoc?.politicaCancelacion;

      if (politica?.permiteCancelacion === false) {
        return res.redirect(
          `${process.env.FRONTEND_URL}/confirmacion-resultado?error=politica`,
        );
      }

      if (politica?.horasLimite > 0) {
        const ahoraChile = dayjs().tz("America/Santiago");
        const fechaReservaChile = dayjs(reserva.fecha).tz("America/Santiago");
        const limiteCancelacion = fechaReservaChile.subtract(
          politica.horasLimite,
          "hour",
        );

        if (ahoraChile.isAfter(limiteCancelacion)) {
          return res.redirect(
            `${process.env.FRONTEND_URL}/confirmacion-resultado?error=politica`,
          );
        }
      }

      reserva.estado = "cancelada";
      reserva.motivoCancelacion = "Cancelada por el cliente desde recordatorio";
      await reserva.save();

      // Email al cliente
      const emailCliente = reserva.cliente?.email || reserva.invitado?.email;
      const nombreCliente = reserva.cliente?.nombre || reserva.invitado?.nombre;
      const fechaChile = dayjs(reserva.fecha).tz("America/Santiago");

      const emailData = {
        nombreCliente,
        nombreBarbero:
          `${reserva.barbero?.nombre} ${reserva.barbero?.apellido || ""}`.trim(),
        fecha: fechaChile.format("DD/MM/YYYY"),
        hora: fechaChile.format("HH:mm"),
        servicio: reserva.servicio?.nombre || "Servicio",
        motivo: "Cancelada por el cliente desde el recordatorio",
        direccion: empresaDoc?.direccion || null,
      };

      if (emailCliente) {
        sendCancelReservationEmail(emailCliente, emailData).catch((err) =>
          console.error("❌ Email cancelación:", err.message),
        );
      }

      // Email al barbero (si la empresa tiene notificaciones activas)
      if (empresaDoc?.envioNotificacionReserva && reserva.barbero?.email) {
        sendProfesionalCancelReservationEmail(
          reserva.barbero.email,
          emailData,
        ).catch((err) => console.error("❌ Email barbero:", err.message));
      }

      // Notificar lista de espera — reutilizando tu lógica existente
      const fechaInicio = new Date(reserva.fecha);
      fechaInicio.setSeconds(0, 0);
      const fechaFin = new Date(reserva.fecha);
      fechaFin.setSeconds(59, 999);

      const notificaciones = await notificacionModel
        .find({
          barberoId: reserva.barbero._id,
          fecha: { $gte: fechaInicio, $lte: fechaFin },
          enviado: false,
        })
        .populate("usuarioId")
        .populate("barberoId");

      await Promise.all(
        notificaciones.map(async (noti) => {
          const barbero = noti.barberoId;
          const fechaNoti = dayjs(noti.fecha).tz("America/Santiago");

          const datosNoti = {
            nombreBarbero: barbero?.nombre || "Tu profesional",
            fecha: fechaNoti.format("DD/MM/YYYY"),
            hora: fechaNoti.format("HH:mm"),
          };

          try {
            // Invitado
            if (noti.esInvitado && noti.emailInvitado) {
              const result = await sendWaitlistNotificationEmail(
                noti.emailInvitado,
                {
                  nombreCliente: "Cliente",
                  ...datosNoti,
                },
              );
              if (!result?.error) {
                noti.enviado = true;
                await noti.save();
              }
              return;
            }

            // Registrado
            const usuario = noti.usuarioId;
            if (!usuario?.email) return;

            const result = await sendWaitlistNotificationEmail(usuario.email, {
              nombreCliente: usuario.nombre,
              ...datosNoti,
            });

            if (!result?.error) {
              noti.enviado = true;
              await noti.save();
            }
          } catch (err) {
            console.error(`❌ Error lista de espera:`, err.message);
          }
        }),
      );

      return res.redirect(
        `${process.env.FRONTEND_URL}/confirmacion-resultado?respuesta=cancela`,
      );
    }
  } catch (error) {
    console.error("❌ Error en confirmación asistencia:", error);
    return res.redirect(
      `${process.env.FRONTEND_URL}/confirmacion-resultado?error=servidor`,
    );
  }
};
