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

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

const calcularHuecosDisponibles = (reservasDelDia, diaCompleto) => {
  // Ordenar reservas por hora de inicio
  const reservasOrdenadas = [...reservasDelDia].sort((a, b) =>
    dayjs(a.fecha).diff(dayjs(b.fecha)),
  );

  const huecos = [];
  let horaActual = diaCompleto.inicio;

  for (const reserva of reservasOrdenadas) {
    // ✅ CORREGIDO: Convertir fecha UTC a Chile
    const inicioReserva = dayjs(reserva.fecha).tz("America/Santiago");
    const finReserva = inicioReserva.add(reserva.duracion, "minute");

    console.log(
      `  Procesando reserva: ${inicioReserva.format(
        "HH:mm",
      )} - ${finReserva.format("HH:mm")}`,
    );

    // Solo considerar reservas que estén dentro del bloque actual
    if (
      finReserva.isBefore(diaCompleto.inicio) ||
      inicioReserva.isAfter(diaCompleto.fin)
    ) {
      continue;
    }

    // Ajustar inicioReserva si está antes del bloque
    const inicioReservaAjustado = inicioReserva.isBefore(diaCompleto.inicio)
      ? diaCompleto.inicio
      : inicioReserva;

    if (horaActual.isBefore(inicioReservaAjustado)) {
      const duracionHueco = inicioReservaAjustado.diff(horaActual, "minute");
      if (duracionHueco > 0) {
        huecos.push({
          inicio: horaActual,
          fin: inicioReservaAjustado,
          duracion: duracionHueco,
        });
      }
    }

    if (finReserva.isAfter(horaActual)) {
      horaActual = finReserva.isAfter(diaCompleto.fin)
        ? diaCompleto.fin
        : finReserva;
    }
  }

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

// 🔹 Controlador principal: Versión corregida con zona horaria
export const createReserva = async (req, res) => {
  try {
    const { barbero, servicio, fecha, hora, cliente } = req.body;

    if (!barbero || !servicio || !fecha || !hora || !cliente) {
      return res
        .status(400)
        .json({ message: "Todos los campos son obligatorios" });
    }

    console.log("🔄 createReserva - VERSIÓN CORREGIDA ZONA HORARIA");
    console.log("📥 Datos recibidos:", {
      barbero,
      servicio,
      fecha,
      hora,
      cliente,
    });

    // ==============================
    // FECHA EN CHILE (CORREGIDO)
    // ==============================
    const ahoraChile = dayjs().tz("America/Santiago");
    console.log("🕐 Ahora en Chile:", ahoraChile.format("YYYY-MM-DD HH:mm"));

    // Crear la fecha completa EN CHILE
    const fechaCompletaChile = dayjs.tz(
      `${fecha} ${formatHora(hora)}`,
      "YYYY-MM-DD HH:mm",
      "America/Santiago",
    );

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
    // SERVICIO
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
    const intervaloMinimo = barberoServicio.intervaloMinimo || 15;

    console.log("⏱️ Duración:", duracionServicio, "minutos");
    console.log("📐 Intervalo mínimo:", intervaloMinimo, "minutos");

    // ==============================
    // HORARIOS DEL DÍA
    // ==============================
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

    // ==============================
    // EXCEPCIONES (CORREGIDO)
    // ==============================
    // Obtener límites del día EN CHILE primero
    const inicioDiaChile = fechaCompletaChile.startOf("day");
    const finDiaChile = fechaCompletaChile.endOf("day");

    // Convertir a UTC para consulta MongoDB
    const inicioDiaUTC = inicioDiaChile.utc().toDate();
    const finDiaUTC = finDiaChile.utc().toDate();

    console.log(
      "🌅 Inicio día Chile:",
      inicioDiaChile.format("YYYY-MM-DD HH:mm"),
    );
    console.log("🌃 Fin día Chile:", finDiaChile.format("YYYY-MM-DD HH:mm"));

    const excepciones = await excepcionHorarioModel.find({
      barbero: barbero,
      fecha: { $gte: inicioDiaUTC, $lt: finDiaUTC },
    });

    // CORRECCIÓN: Convertir fechas UTC a Chile para comparar
    const horasBloqueadas = excepciones
      .filter((e) => e.tipo === "bloqueo")
      .map((e) => dayjs(e.fecha).tz("America/Santiago").format("HH:mm"));

    console.log("🚫 Horas bloqueadas:", horasBloqueadas);

    // ==============================
    // RESERVAS EXISTENTES (CORREGIDO)
    // ==============================
    const reservasDelDia = await Reserva.find({
      barbero,
      fecha: {
        $gte: inicioDiaUTC,
        $lt: finDiaUTC,
      },
      estado: { $in: ["pendiente", "confirmada"] },
    });

    console.log("📅 Reservas existentes encontradas:", reservasDelDia.length);

    // ==============================
    // VALIDACIÓN CORREGIDA CON ZONA HORARIA
    // ==============================
    const horaFormateada = formatHora(hora);
    console.log("🔍 Validando hora:", horaFormateada);

    const inicioReserva = fechaCompletaChile;
    const finReserva = fechaCompletaChile.add(duracionServicio, "minute");

    console.log(
      `🕒 Servicio solicitado: ${inicioReserva.format(
        "HH:mm",
      )} - ${finReserva.format("HH:mm")} (${duracionServicio} min)`,
    );

    // 1. Verificar que no esté bloqueada
    if (horasBloqueadas.includes(horaFormateada)) {
      console.log("❌ Hora bloqueada por excepción");
      return res.status(400).json({
        message: "La hora está bloqueada por el barbero",
        hora: horaFormateada,
      });
    }

    // 2. Verificar intervalo mínimo
    const minutosHora = horaAminutos(horaFormateada);
    if (minutosHora % intervaloMinimo !== 0) {
      console.log(`❌ Hora no es múltiplo de ${intervaloMinimo} min`);
      return res.status(400).json({
        message: `La hora debe ser múltiplo de ${intervaloMinimo} minutos`,
        hora: horaFormateada,
        intervaloMinimo: intervaloMinimo,
      });
    }

    // 3. Verificar horario del barbero
    let horarioValido = null;
    for (const horario of horariosDelDia) {
      const horarioInicio = dayjs.tz(
        `${fecha} ${horario.horaInicio}`,
        "YYYY-MM-DD HH:mm",
        "America/Santiago",
      );
      const horarioFin = dayjs.tz(
        `${fecha} ${horario.horaFin}`,
        "YYYY-MM-DD HH:mm",
        "America/Santiago",
      );

      if (
        inicioReserva.isSameOrAfter(horarioInicio) &&
        finReserva.isSameOrBefore(horarioFin)
      ) {
        horarioValido = { inicio: horarioInicio, fin: horarioFin };
        console.log(
          `✅ Cabe en horario: ${horarioInicio.format(
            "HH:mm",
          )}-${horarioFin.format("HH:mm")}`,
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

    // 4. VALIDACIÓN DE COLISIONES CORREGIDA (con zona horaria)
    let hayColision = false;

    // Log para debug: mostrar todas las reservas existentes en Chile
    console.log("🔍 Revisando colisiones con reservas existentes:");
    reservasDelDia.forEach((reserva, index) => {
      const inicioExistente = dayjs(reserva.fecha).tz("America/Santiago");
      const finExistente = inicioExistente.add(reserva.duracion, "minute");

      console.log(
        `   Reserva ${index + 1}: ${inicioExistente.format(
          "HH:mm",
        )}-${finExistente.format("HH:mm")} (${reserva.duracion} min)`,
      );
    });

    for (const reservaExistente of reservasDelDia) {
      // CORRECCIÓN CRÍTICA: Convertir fecha UTC a Chile
      const inicioExistente = dayjs(reservaExistente.fecha).tz(
        "America/Santiago",
      );
      const finExistente = inicioExistente.add(
        reservaExistente.duracion,
        "minute",
      );

      // Verificar solapamiento
      // Caso 1: Nueva reserva empieza DENTRO de una existente
      // Caso 2: Nueva reserva termina DENTRO de una existente
      // Caso 3: Nueva reserva envuelve a una existente
      // Caso 4: Son exactamente iguales

      const seSolapan =
        // Caso 1 y 2: Solapamiento parcial
        (inicioReserva.isBefore(finExistente) &&
          finReserva.isAfter(inicioExistente)) ||
        // Caso 3: Nueva reserva envuelve existente
        (inicioReserva.isSameOrBefore(inicioExistente) &&
          finReserva.isSameOrAfter(finExistente)) ||
        // Caso 4: Son iguales
        (inicioReserva.isSame(inicioExistente) &&
          finReserva.isSame(finExistente));

      if (seSolapan) {
        console.log(
          `⚠️ COLISIÓN detectada: ${inicioExistente.format(
            "HH:mm",
          )}-${finExistente.format("HH:mm")}`,
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
          horaSolicitada: horaFormateada,
          duracionServicio: duracionServicio,
          horaFin: finReserva.format("HH:mm"),
        },
      });
    }

    // 5. No permitir horas pasadas
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

    // ==============================
    // VALIDACIÓN CON HUECOS (OPCIONAL - para debug)
    // ==============================
    // Esto solo es para verificar, no para bloquear
    const diaCompleto = {
      inicio: horarioValido.inicio,
      fin: horarioValido.fin,
    };

    const huecos = calcularHuecosDisponibles(reservasDelDia, diaCompleto);
    console.log(`📊 Huecos disponibles: ${huecos.length}`);
    huecos.forEach((hueco, i) => {
      console.log(
        `   Hueco ${i + 1}: ${hueco.inicio.format("HH:mm")}-${hueco.fin.format(
          "HH:mm",
        )} (${hueco.duracion} min)`,
      );
    });

    // Verificar si la nueva reserva debería caber en algún hueco
    let cabeEnAlgunHueco = false;
    for (const hueco of huecos) {
      if (
        inicioReserva.isSameOrAfter(hueco.inicio) &&
        finReserva.isSameOrBefore(hueco.fin)
      ) {
        cabeEnAlgunHueco = true;
        console.log(
          `✅ Reserva cabe en hueco: ${hueco.inicio.format(
            "HH:mm",
          )}-${hueco.fin.format("HH:mm")}`,
        );
        break;
      }
    }

    if (!cabeEnAlgunHueco && huecos.length > 0) {
      console.log(
        "⚠️ ADVERTENCIA: La reserva no cabe en ningún hueco según cálculo de huecos",
      );
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
    // EMAIL
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

// Función auxiliar para convertir hora a minutos
function horaAminutos(hora) {
  const [horas, minutos] = hora.split(":").map(Number);
  return horas * 60 + minutos;
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
