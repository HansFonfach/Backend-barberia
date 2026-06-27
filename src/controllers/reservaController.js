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
  sendReagendamientoEmail,
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
import { getHorasDisponibles } from "./horarioController.js";
import { validarDisponibilidad } from "../helpers/validarDisponibilidad.js";
import reservaModel from "../models/reserva.model.js";
import productoModel from "../models/producto.Model.js";

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
          const suscripcionVencida = await suscripcionModel
            .findOne({ usuario: cliente })
            .sort({ fechaFin: -1 });

          if (suscripcionVencida) {
            const fechaVencimiento = dayjs(suscripcionVencida.fechaFin)
              .tz("America/Santiago")
              .format("DD/MM/YYYY");
            return res.status(403).json({
              message: `Tu suscripción venció el ${fechaVencimiento}, por lo que no puedes reservar este sábado`,
            });
          }

          return res.status(403).json({
            message: "Las reservas del sábado son solo para suscriptores",
          });
        }

        const SERVICIO_COMBO_ID = "69934ce087e49726a2cd3da1";
        const SERVICIO_BARBA_ID = "6993a5495dada31f33304c19"; // 👈 agregar aquí
        const esCombo =
          suscripcionActiva.tipoPlan === "combo_visita_corte_barba";
        const esBarba = suscripcionActiva.tipoPlan === "barba"; // 👈 agregar aquí

        const todasLasReservas = await Reserva.find({
          cliente,
          fecha: {
            $gte: suscripcionActiva.fechaInicio,
            $lte: suscripcionActiva.fechaFin,
          },
          estado: { $ne: "cancelada" },
        }).populate("servicio", "_id");

        let serviciosAgendados = 0;
        for (const r of todasLasReservas) {
          if (esCombo) {
            if (r.servicio?._id?.toString() === SERVICIO_COMBO_ID) {
              serviciosAgendados += 1;
            }
          } else if (esBarba) {
            if (r.servicio?._id?.toString() === SERVICIO_BARBA_ID) {
              serviciosAgendados += 1;
            }
          } else {
            // creditos y padre_e_hijo
            serviciosAgendados += r.duracion >= 120 ? 2 : 1;
          }
        }

        if (serviciosAgendados >= suscripcionActiva.serviciosTotales) {
          return res.status(403).json({
            message:
              "Has agotado los servicios de tu suscripción. No puedes reservar sábados hasta renovarla",
          });
        }
      }
      // Si la empresa no tiene suscripción, el sábado es libre
    }

    const SERVICIO_COMBO_ID = "69934ce087e49726a2cd3da1";
    const SERVICIO_BARBA_ID = "6993a5495dada31f33304c19";

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

    const { duracion: duracionServicio, intervaloMinimo = 15 } =
      barberoServicio;

    // El precio viene del servicio poblado, no de BarberoServicio
    const precioServicio = Number(barberoServicio.servicio?.precio ?? 0);

    const nombreServicio = barberoServicio.servicio.nombre;
    const finReservaChile = inicioReservaChile.add(duracionServicio, "minute");

    /* =============================
       RANGO DE BÚSQUEDA DEL DÍA
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

    /* =============================
       HORARIOS (normales + horas extra)
    ============================== */
    const horariosDelDia = barberoDoc.horariosDisponibles.filter(
      (h) => Number(h.diaSemana) === diaSemana,
    );

    const horasExtraDelDia = await excepcionHorarioModel.find({
      barbero,
      tipo: "extra",
      fecha: { $gte: inicioBusqueda, $lt: finBusqueda },
    });

    if (!horariosDelDia.length && !horasExtraDelDia.length) {
      return res.status(400).json({
        message: "El profesional no trabaja este día",
      });
    }

    let bloqueValido = null;
    let esHoraExtra = false;

    // 👇 Primero revisamos las horas extra — tienen prioridad
    for (const he of horasExtraDelDia) {
      if (!he.horaFin) continue;

      const ini = dayjs.tz(
        `${fecha} ${he.horaInicio}`,
        "YYYY-MM-DD HH:mm",
        "America/Santiago",
      );
      const fin = dayjs.tz(
        `${fecha} ${he.horaFin}`,
        "YYYY-MM-DD HH:mm",
        "America/Santiago",
      );

      if (
        inicioReservaChile.isSameOrAfter(ini) &&
        finReservaChile.isSameOrBefore(fin)
      ) {
        bloqueValido = { inicio: ini, fin };
        esHoraExtra = true;
        break;
      }
    }

    // 👇 Si no matcheó ninguna hora extra, revisamos el horario normal
    if (!bloqueValido) {
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
    }

    if (!bloqueValido) {
      return res.status(400).json({
        message: "El servicio no cabe en el horario del profesional",
      });
    }
    /* =============================
       EXCEPCIONES
    ============================== */

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
    let horasDisponiblesData = null;

    await getHorasDisponibles(
      {
        params: { id: barbero },
        query: { fecha, servicioId: servicio },
        usuario: req.usuario,
      },
      {
        json: (data) => {
          horasDisponiblesData = data;
        },
      },
    );

    if (!horasDisponiblesData || !horasDisponiblesData.horas) {
      return res.status(400).json({
        message: "No se pudo validar disponibilidad",
      });
    }

    const horaDisponible = horasDisponiblesData.horas.find(
      (h) => h.hora === horaFormateada && h.estado === "disponible",
    );

    if (!horaDisponible) {
      return res.status(400).json({
        message: "La hora seleccionada ya no está disponible",
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

    console.log(
      "🔍 DEBUG reservasDelDia:",
      reservasDelDia.map((r) => ({
        fecha: dayjs(r.fecha).tz("America/Santiago").format("YYYY-MM-DD HH:mm"),
        duracion: r.duracion,
      })),
    );

    if (esHoraExtra) {
      const CAPACIDAD_HORA_EXTRA = 2;

      // 👇 Solo contar reservas que EMPIEZAN exactamente a la misma hora,
      // no las que simplemente se solapan en el tiempo
      const mismaHoraExacta = reservasDelDia.filter((r) => {
        const ini = dayjs(r.fecha).tz("America/Santiago");
        return ini.isSame(inicioReservaChile);
      });

      if (mismaHoraExacta.length >= CAPACIDAD_HORA_EXTRA) {
        return res.status(400).json({
          message: "Ya se alcanzó el cupo máximo para este horario extra",
        });
      }
    } else {
      for (const r of reservasDelDia) {
        const ini = dayjs(r.fecha).tz("America/Santiago");
        const fin = ini.add(r.duracion, "minute");

        if (inicioReservaChile.isBefore(fin) && finReservaChile.isAfter(ini)) {
          return res.status(400).json({
            message: "La hora ya está ocupada",
          });
        }
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

      const porcentaje = Number(empresaDoc.pagos.porcentajeAbono || 0);
      const montoFijo = Number(empresaDoc.pagos.montoAbonoFijo || 0);
      const precio = Number(precioServicio || 0);

      const monto =
        tipoAbono === "porcentaje"
          ? Math.round((precio * porcentaje) / 100)
          : montoFijo;

      abonoData = {
        requerido: true,
        monto: isNaN(monto) ? 0 : monto, // ← seguro contra NaN
        tipoCalculo: tipoAbono,
        porcentajeAplicado: tipoAbono === "porcentaje" ? porcentaje : 0,
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
      servicioSnapshot: {
        nombre: nombreServicio,
        precio: precioServicio,
        duracion: duracionServicio,
      },
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
   CONSUMIR CRÉDITO SUSCRIPCIÓN
============================== */

    const planesQueConsumenCredito = [
      "creditos",
      "padre_e_hijo",
      "combo_visita_corte_barba",
      "barba",
    ];

    const suscripcionActual = await suscripcionModel.findOne({
      usuario: cliente,
      empresa,
      activa: true,
      tipoPlan: { $in: planesQueConsumenCredito },
      fechaInicio: { $lte: new Date() },
      fechaFin: { $gte: new Date() },
    });

    if (suscripcionActual) {
      // Para combo, solo consume si es el servicio específico
      if (
        suscripcionActual.tipoPlan === "combo_visita_corte_barba" &&
        servicio.toString() !== SERVICIO_COMBO_ID
      ) {
        // No consumir crédito si no es el servicio del combo
      }
      // Para barba, solo consume si es el servicio de barba (ya validado arriba)
      else if (
        suscripcionActual.tipoPlan === "barba" &&
        servicio.toString() !== SERVICIO_BARBA_ID
      ) {
        // No debería llegar aquí por la validación previa, pero por si acaso
      } else {
        // creditos, padre_e_hijo, barba con servicio correcto, combo con servicio correcto
        const nuevosUsados = suscripcionActual.serviciosUsados + 1;
        const agotar = nuevosUsados >= suscripcionActual.serviciosTotales;

        await suscripcionModel.findByIdAndUpdate(suscripcionActual._id, {
          $inc: { serviciosUsados: 1 },
          ...(agotar && { $set: { activa: false } }),
        });

        if (agotar) {
          await usuarioModel.findByIdAndUpdate(cliente, {
            $set: { suscrito: false },
          });
        }
      }
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
      horasLimite: empresaDoc.politicaCancelacion?.horasLimite ?? null,
      telefonoEmpresa: empresaDoc.telefono ?? null,
      // 👇 nuevo
      requiereAbono,
      montoAbono: abonoData.monto,
      datosPago: requiereAbono ? empresaDoc.pagos?.transferencia : null,
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
        nombreCliente: `${clienteDoc.nombre} ${clienteDoc.apellido}`,
        fecha,
        hora: horaFormateada,
        servicio: nombreServicio,
        telefonoCliente: clienteDoc.telefono,
        plantilla: "notificacion_reserva", //
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

    // 1️⃣ Cargar empresa
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
      direccion: empresaDoc?.direccion || null,
    };

    // 5️⃣ Email al cliente — siempre
    if (emailCliente) {
      sendCancelReservationEmail(emailCliente, emailData).catch((error) =>
        console.error(
          "❌ Error enviando correo de cancelación:",
          error.message,
        ),
      );
    }

    // 6️⃣ WhatsApp al cliente — solo si cancela el barbero
    const telefonoCliente =
      existeReserva.cliente?.telefono || existeReserva.invitado?.telefono;

    if (telefonoCliente && rolUsuario === "barbero") {
      WhatsappService.enviarCancelacionCliente({
        telefono: telefonoCliente,
        nombreCliente,
        motivo: existeReserva.motivoCancelacion,
        nombreProfesional: existeReserva.barbero?.nombre || "Profesional",
        servicio: existeReserva.servicio?.nombre || "Servicio",
        fecha: fechaFormateada,
        hora: horaFormateada,
        direccion: empresaDoc?.direccion || "-",
      }).catch((err) =>
        console.error(
          "❌ Error enviando WhatsApp de cancelación al cliente:",
          err.message,
        ),
      );
    }

    // 7️⃣ Email al barbero
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

    // 8️⃣ WhatsApp al barbero — solo si cancela el cliente
    if (existeReserva.barbero?.telefono && rolUsuario === "cliente") {
      WhatsappService.enviarNotificacionProfesional({
        telefono: existeReserva.barbero.telefono,
        nombreProfesional: existeReserva.barbero.nombre,
        nombreCliente: `${existeReserva.cliente?.nombre} ${existeReserva.cliente?.apellido}`,
        fecha: fechaFormateada,
        hora: horaFormateada,
        servicio: existeReserva.servicio?.nombre || "Servicio",
        telefonoCliente: existeReserva.cliente?.telefono,
      }).catch((err) =>
        console.error(`❌ Error WhatsApp barbero:`, err.message),
      );
    }

    // 9️⃣ Notificar lista de espera
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
      .populate(
        "cliente",
        "nombre apellido telefono rut email notasProfesional",
      )
      .populate("servicio", "nombre duracion precio _id")
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
        const SERVICIO_COMBO_ID = "69934ce087e49726a2cd3da1";

        const reservasDelCliente = await Reserva.find({
          cliente: clienteId,
          fecha: { $gte: sus.fechaInicio, $lte: reserva.fecha },
          estado: { $ne: "cancelada" },
        }).sort({ fecha: 1 });

        let serviciosAcumulados = 0;
        const esCombo = sus.tipoPlan === "combo_visita_corte_barba";

        for (const r of reservasDelCliente) {
          let peso = 0;

          if (esCombo) {
            // Solo cuenta si es el servicio combo específico
            peso = r.servicio?.toString() === SERVICIO_COMBO_ID ? 1 : 0;
          } else {
            // Plan creditos: duración >= 120 = 2 servicios
            peso = r.duracion >= 120 ? 2 : 1;
          }

          serviciosAcumulados += peso;
          if (r._id.toString() === reserva._id.toString()) break;
        }

        // Determinar si esta reserva específica está cubierta por la suscripción
        const esCubierta = esCombo
          ? reserva.servicio?._id?.toString() === SERVICIO_COMBO_ID
          : true;

        return {
          ...reserva.toObject(),
          suscripcion: esCubierta
            ? {
                posicion: serviciosAcumulados,
                limite: sus.serviciosTotales,
                esDobleServicio: !esCombo && reserva.duracion >= 120,
              }
            : null, // null = debe pagar, no está en el plan
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
    const { respuesta } = req.query;

    // Buscar primero para tener el slug disponible en todos los redirects
    const reserva = await Reserva.findOne({
      "confirmacionAsistencia.token": token,
    })
      .populate("cliente", "nombre email telefono")
      .populate("barbero", "nombre apellido email")
      .populate("servicio", "nombre")
      .populate("empresa");

    const slug = reserva?.empresa?.slug || "";
    const baseUrl = `${process.env.FRONTEND_URL}/${slug}/confirmar-reserva`;

    // Validar respuesta
    if (!["confirma", "cancela"].includes(respuesta)) {
      return res.status(400).json({ error: "invalido" });
    }

    if (!reserva) {
      return res.status(404).json({ error: "token" });
    }

    // Ya respondió antes
    if (reserva.confirmacionAsistencia.respondida) {
      return res.status(200).json({
        success: true,
        respuesta: reserva.confirmacionAsistencia.respuesta,
        ya_respondida: true,
      });
    }

    // La reserva ya ocurrió
    if (reserva.fecha < new Date()) {
      return res.status(400).json({ error: "expirado" });
    }

    reserva.confirmacionAsistencia.respondida = true;
    reserva.confirmacionAsistencia.respuesta = respuesta;
    reserva.confirmacionAsistencia.respondidaEn = new Date();
    reserva.confirmacionUsuario = true;
    reserva.fechaConfirmacion = new Date();

    // ── CONFIRMA ──────────────────────────────────────────
    if (respuesta === "confirma") {
      reserva.estado = "confirmada";
      await reserva.save();
      return res.status(200).json({ success: true, respuesta: "confirma" });
    }

    // ── CANCELA ───────────────────────────────────────────
    if (respuesta === "cancela") {
      const empresaDoc = reserva.empresa;
      const politica = empresaDoc?.politicaCancelacion;

      if (politica?.permiteCancelacion === false) {
        return res.status(400).json({ error: "politica" });
      }

      if (politica?.horasLimite > 0) {
        const ahoraChile = dayjs().tz("America/Santiago");
        const fechaReservaChile = dayjs(reserva.fecha).tz("America/Santiago");
        const limiteCancelacion = fechaReservaChile.subtract(
          politica.horasLimite,
          "hour",
        );
        if (ahoraChile.isAfter(limiteCancelacion)) {
          return res.status(400).json({ error: "politica" });
        }
      }

      reserva.estado = "cancelada";
      reserva.motivoCancelacion = "Cancelada por el cliente desde recordatorio";
      await reserva.save();

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

      if (empresaDoc?.envioNotificacionReserva && reserva.barbero?.email) {
        sendProfesionalCancelReservationEmail(
          reserva.barbero.email,
          emailData,
        ).catch((err) => console.error("❌ Email barbero:", err.message));
      }

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
            if (noti.esInvitado && noti.emailInvitado) {
              const result = await sendWaitlistNotificationEmail(
                noti.emailInvitado,
                { nombreCliente: "Cliente", ...datosNoti },
              );
              if (!result?.error) {
                noti.enviado = true;
                await noti.save();
              }
              return;
            }
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

      return res.status(200).json({ success: true, respuesta: "cancela" });
    }
  } catch (error) {
    console.error("❌ Error en confirmación asistencia:", error);
    return res.status(500).json({ error: "servidor" });
  }
};

export const reagendarReserva = async (req, res) => {
  try {
    const { id } = req.params; // ID reserva original
    const { fecha, hora } = req.body; // nuevo slot
    const adminId = req.usuario?.id;

    // DEBE ESTAR ASÍ:
    if (!fecha || !hora) {
      return res.status(400).json({ message: "Fecha y hora son requeridas" });
    }

    // 1. Buscar reserva original
    const reservaOriginal = await Reserva.findById(id).populate(
      "barbero servicio cliente empresa", // ✅ agrega empresa
    );

    if (!reservaOriginal)
      return res.status(404).json({ message: "Reserva no encontrada" });

    if (
      ["cancelada", "completada", "reagendada"].includes(reservaOriginal.estado)
    )
      return res
        .status(400)
        .json({ message: "Esta reserva no puede reagendarse" });

    const barberoDoc = await usuarioModel
      .findById(reservaOriginal.barbero)
      .populate("horariosDisponibles");

    // 2. Validar disponibilidad del nuevo slot
    const validacion = await validarDisponibilidad({
      barberoDoc,
      barbero: reservaOriginal.barbero._id,
      servicio: reservaOriginal.servicio._id,
      fecha,
      hora,
      duracionServicio: reservaOriginal.duracion,
      excluirReservaId: reservaOriginal._id, // excluye la reserva actual de colisiones
    });

    if (!validacion.ok)
      return res.status(400).json({ message: validacion.message });

    const { inicioReservaChile, finReservaChile } = validacion;
    const nuevaFechaUTC = inicioReservaChile.utc().toDate();
    const fechaAnterior = reservaOriginal.fecha;

    // 3. Marcar reserva original como reagendada
    await Reserva.findByIdAndUpdate(id, {
      estado: "reagendada",
      "reagendamiento.fechaAnterior": fechaAnterior,
      "reagendamiento.reagendadaEn": new Date(),
      "reagendamiento.reagendadaPor": adminId,
    });

    // 4. Crear nueva reserva copiando los datos relevantes
    const nuevaReserva = await Reserva.create({
      empresa: reservaOriginal.empresa,
      cliente: reservaOriginal.cliente,
      invitado: reservaOriginal.invitado,
      barbero: reservaOriginal.barbero._id,
      servicio: reservaOriginal.servicio._id,
      fecha: nuevaFechaUTC,
      duracion: reservaOriginal.duracion,
      estado:
        reservaOriginal.estado === "confirmada" ? "confirmada" : "pendiente",
      abono: reservaOriginal.abono,
      reagendamiento: {
        reagendadaDe: reservaOriginal._id,
        reagendadaEn: new Date(),
        reagendadaPor: adminId,
      },
    });

    // 5. Enviar correo
    try {
      const clienteEmail =
        reservaOriginal.cliente?.email ?? reservaOriginal.invitado?.email;

      if (clienteEmail) {
        await sendReagendamientoEmail(clienteEmail, {
          nombreCliente:
            reservaOriginal.cliente?.nombre ||
            reservaOriginal.invitado?.nombre ||
            "Cliente",

          nombreBarbero: reservaOriginal.barbero.nombre,
          servicio: reservaOriginal.servicio.nombre,

          fechaAnterior: dayjs(fechaAnterior)
            .tz("America/Santiago")
            .format("YYYY-MM-DD HH:mm"),

          nuevaFecha: inicioReservaChile.format("YYYY-MM-DD"),
          nuevaHora: inicioReservaChile.format("HH:mm"),

          direccion: reservaOriginal.empresa?.direccion,
        });
      }
    } catch (error) {
      console.error("❌ Error enviando correo de reagendamiento:", error);
    }

    return res.status(200).json({
      message: "Reserva reagendada correctamente",
      reservaAnteriorId: id,
      nuevaReserva,
      fechaAnterior: dayjs(fechaAnterior)
        .tz("America/Santiago")
        .format("YYYY-MM-DD HH:mm"),
      nuevaFecha: inicioReservaChile.format("YYYY-MM-DD HH:mm"),
      horaFin: finReservaChile.format("HH:mm"),
    });
  } catch (error) {
    console.error("❌ Error reagendarReserva:", error);
    res.status(500).json({ message: "Error al reagendar la reserva" });
  }
};

export const actualizarReserva = async (req, res) => {
  try {
    const { id } = req.params;
    const { observacionFinal, productos, extras } = req.body; // 👈 se agrega extras

    const reserva = await Reserva.findById(id).populate("servicio");
    if (!reserva)
      return res.status(404).json({ message: "Reserva no encontrada" });

    const updateData = {};

    // ── Observación ──
    if (observacionFinal !== undefined) {
      updateData.observacionFinal = observacionFinal;
    }

    // ── Productos ──
    if (productos !== undefined) {
      const ids = productos.map((p) => p.producto);
      const productosDB = await productoModel.find({ _id: { $in: ids } });

      let totalProductos = 0;
      updateData.productos = productos.map((item) => {
        const prod = productosDB.find(
          (p) => p._id.toString() === item.producto,
        );
        const subtotal = (prod?.precio || 0) * (item.cantidad || 1);
        totalProductos += subtotal;
        return {
          producto: prod._id,
          nombre: prod.nombre,
          precio: prod.precio,
          categoria: prod.categoria,
          cantidad: item.cantidad || 1,
          subtotal,
        };
      });

      updateData.totalProductos = totalProductos;

      // ajustar stock
      const anteriores = reserva.productos || [];
      for (const ant of anteriores) {
        await productoModel.findOneAndUpdate(
          { _id: ant.producto, stock: { $ne: null } },
          { $inc: { stock: ant.cantidad } },
        );
      }
      for (const item of productos) {
        await productoModel.findOneAndUpdate(
          { _id: item.producto, stock: { $ne: null } },
          { $inc: { stock: -(item.cantidad || 1) } },
        );
      }
    }

    // ── Extras ──
    if (extras !== undefined) {
      let totalExtras = 0;
      updateData.extras = extras.map((item) => {
        const subtotal = (item.precio || 0) * (item.cantidad || 1);
        totalExtras += subtotal;
        return {
          nombre: item.nombre,
          precio: item.precio,
          cantidad: item.cantidad || 1,
          subtotal,
        };
      });
      updateData.totalExtras = totalExtras;
    }

    // ── Recalcular totalFinal siempre que cambie algo ──
    if (productos !== undefined || extras !== undefined) {
      const totalServicio =
        reserva.servicioSnapshot?.precio || reserva.servicio?.precio || 0;

      // Si no vino en este request, usa lo que ya tenía guardado la reserva
      const totalProductos =
        updateData.totalProductos ?? reserva.totalProductos ?? 0;
      const totalExtras = updateData.totalExtras ?? reserva.totalExtras ?? 0;

      updateData.totalServicio = totalServicio;
      updateData.totalFinal = totalServicio + totalProductos + totalExtras;
    }

    const reservaActualizada = await Reserva.findByIdAndUpdate(id, updateData, {
      new: true,
    });

    res.json({ message: "Reserva actualizada", reserva: reservaActualizada });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
