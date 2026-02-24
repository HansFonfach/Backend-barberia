import Horario from "../models/horario.model.js";
import Usuario from "../models/usuario.model.js";
import Reserva from "../models/reserva.model.js";
import ExcepcionHorarioModel from "../models/excepcionHorario.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter.js";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore.js";
import { verificarFeriadoConComportamiento } from "../utils/feriados.js";
import { generarBloquesDesdeHorario } from "../utils/generarBloquesDesdeHorario.js";
import barberoServicioModel from "../models/barberoServicio.model.js";
import suscripcionModel from "../models/suscripcion.model.js";
import horarioModel from "../models/horario.model.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

/* =====================================================
   FUNCIONES AUXILIARES
===================================================== */

const calcularHuecosDisponibles = (reservasDelDia, bloque) => {
  const reservasFiltradas = reservasDelDia
    .map((r) => {
      const inicio = dayjs(r.fecha).tz("America/Santiago"); // ✅ FIX
      const fin = inicio.add(r.duracion, "minute");
      return { inicio, fin };
    })
    .filter(
      (r) => r.fin.isAfter(bloque.inicio) && r.inicio.isBefore(bloque.fin),
    )
    .sort((a, b) => a.inicio.diff(b.inicio));

  const huecos = [];
  let cursor = bloque.inicio;

  for (const r of reservasFiltradas) {
    const inicioReserva = r.inicio.isBefore(bloque.inicio)
      ? bloque.inicio
      : r.inicio;

    if (cursor.isBefore(inicioReserva)) {
      huecos.push({
        inicio: cursor,
        fin: inicioReserva,
        duracion: inicioReserva.diff(cursor, "minute"),
      });
    }

    if (r.fin.isAfter(cursor)) {
      cursor = r.fin;
    }
  }

  if (cursor.isBefore(bloque.fin)) {
    huecos.push({
      inicio: cursor,
      fin: bloque.fin,
      duracion: bloque.fin.diff(cursor, "minute"),
    });
  }

  return huecos;
};

/**
 * 🔥 FUNCIÓN CLAVE CORREGIDA
 * Solo genera inicios donde el servicio COMPLETO cabe
 */
const generarIniciosEnHueco = (hueco, intervalo, duracionServicio) => {
  const inicios = [];
  let horaActual = hueco.inicio;

  while (horaActual.add(duracionServicio, "minute").isSameOrBefore(hueco.fin)) {
    inicios.push(horaActual.format("HH:mm"));
    horaActual = horaActual.add(intervalo, "minute");
  }

  return inicios;
};

/* =====================================================
   CONTROLLER
===================================================== */

export const getHorasDisponibles = async (req, res) => {
  try {
    const { id: barberoId } = req.params;
    const { fecha, servicioId } = req.query;
    const usuario = req.usuario;

    if (!fecha || !servicioId) {
      return res.status(400).json({ message: "Fecha y servicio requeridos" });
    }

    const ahora = dayjs().tz("America/Santiago");
    const fechaConsulta = dayjs.tz(fecha, "YYYY-MM-DD", "America/Santiago");

    if (!fechaConsulta.isValid()) {
      return res.status(400).json({ message: "Fecha inválida" });
    }

    /* ================= SERVICIO ================= */
    const barberoServicio = await barberoServicioModel
      .findOne({
        barbero: barberoId,
        servicio: servicioId,
        activo: true,
      })
      .populate("servicio");

    if (!barberoServicio) {
      return res.status(400).json({
        message: "Servicio no disponible para este barbero",
      });
    }

    const duracionServicio = Number(barberoServicio.duracion);

    /* ================= FERIADOS ================= */
    const feriado = await verificarFeriadoConComportamiento(fecha);

    if (feriado?.comportamiento === "cerrado") {
      return res.json({
        fecha,
        horas: [],
        esFeriado: true,
        nombreFeriado: feriado.nombre,
      });
    }

    /* ================= SUSCRIPCIÓN ================= */
    let suscripcionActiva = null;

    if (usuario) {
      suscripcionActiva = await suscripcionModel.findOne({
        usuario: usuario.id,
        activa: true,
        fechaInicio: { $lte: new Date() },
        fechaFin: { $gte: new Date() },
      });
    }

    /* ================= LÍMITE DE DÍAS ================= */
    const limiteNormal = ahora.add(15, "day").endOf("day");
    let limiteDias = limiteNormal;

    if (suscripcionActiva) {
      const limiteSuscripcion = dayjs(suscripcionActiva.fechaInicio)
        .tz("America/Santiago")
        .add(31, "day")
        .endOf("day");

      // max(hoy + 15, fechaSuscripcion + 31)
      limiteDias = limiteSuscripcion.isAfter(limiteNormal)
        ? limiteSuscripcion
        : limiteNormal;
    }

    if (fechaConsulta.isAfter(limiteDias, "day")) {
      return res.status(400).json({
        message: suscripcionActiva
          ? "No puedes reservar más allá de los 31 días de tu suscripción"
          : "No puedes reservar con más de 15 días de anticipación",
      });
    }

    /* ================= BARBERO ================= */
    const barbero = await Usuario.findById(barberoId).populate(
      "horariosDisponibles",
    );

    if (!barbero) {
      return res.status(404).json({ message: "Barbero no encontrado" });
    }

    const diaSemana = fechaConsulta.day();

    const horariosDelDia = barbero.horariosDisponibles.filter(
      (h) => Number(h.diaSemana) === diaSemana,
    );

    if (!horariosDelDia.length) {
      return res.json({
        fecha,
        horas: [],
        mensaje: "El barbero no trabaja este día",
      });
    }

    /* ================= RESERVAS ================= */
    const reservas = await Reserva.find({
      barbero: barberoId,
      fecha: {
        $gte: fechaConsulta.startOf("day").toDate(),
        $lt: fechaConsulta.endOf("day").toDate(),
      },
      estado: { $in: ["pendiente", "confirmada"] },
    });

    const horasReservadas = reservas.map((r) =>
      dayjs(r.fecha).tz("America/Santiago").format("HH:mm"),
    );

    /* ================= EXCEPCIONES ================= */
    const excepciones = await ExcepcionHorarioModel.find({
      barbero: barberoId,
      fecha: {
        $gte: fechaConsulta.startOf("day").utc().toDate(),
        $lt: fechaConsulta.endOf("day").utc().toDate(),
      },
    });

    const horasBloqueadas = excepciones
      .filter((e) => e.tipo === "bloqueo")
      .map((e) => e.horaInicio);

    const horasExtra = excepciones
      .filter((e) => e.tipo === "extra")
      .map((e) => e.horaInicio);

    /* ================= HORAS DISPONIBLES ================= */
    const horasDisponibles = new Set();
    const horasBase = new Set();

    for (const horario of horariosDelDia) {
      const intervalo = Number(horario.duracionBloque);

      let cursor = dayjs.tz(
        `${fecha} ${horario.horaInicio}`,
        "YYYY-MM-DD HH:mm",
        "America/Santiago",
      );

      const fin = dayjs.tz(
        `${fecha} ${horario.horaFin}`,
        "YYYY-MM-DD HH:mm",
        "America/Santiago",
      );

      while (cursor.isBefore(fin)) {
        horasBase.add(cursor.format("HH:mm"));
        cursor = cursor.add(intervalo, "minute");
      }

      const bloquesTrabajo = horario.colacionInicio
        ? [
            {
              inicio: dayjs.tz(
                `${fecha} ${horario.horaInicio}`,
                "YYYY-MM-DD HH:mm",
                "America/Santiago",
              ),
              fin: dayjs.tz(
                `${fecha} ${horario.colacionInicio}`,
                "YYYY-MM-DD HH:mm",
                "America/Santiago",
              ),
            },
            {
              inicio: dayjs.tz(
                `${fecha} ${horario.colacionFin}`,
                "YYYY-MM-DD HH:mm",
                "America/Santiago",
              ),
              fin: dayjs.tz(
                `${fecha} ${horario.horaFin}`,
                "YYYY-MM-DD HH:mm",
                "America/Santiago",
              ),
            },
          ]
        : [
            {
              inicio: dayjs.tz(
                `${fecha} ${horario.horaInicio}`,
                "YYYY-MM-DD HH:mm",
                "America/Santiago",
              ),
              fin: dayjs.tz(
                `${fecha} ${horario.horaFin}`,
                "YYYY-MM-DD HH:mm",
                "America/Santiago",
              ),
            },
          ];

      for (const bloque of bloquesTrabajo) {
        const huecos = calcularHuecosDisponibles(reservas, bloque);

        for (const hueco of huecos) {
          if (hueco.duracion >= duracionServicio) {
            generarIniciosEnHueco(hueco, intervalo, duracionServicio).forEach(
              (hora) => {
                if (!horasBloqueadas.includes(hora)) {
                  horasDisponibles.add(hora);
                }
              },
            );
          }
        }
      }
    }

    horasExtra.forEach((h) => horasBase.add(h));

    /* ================= RESPUESTA FINAL ================= */
    const horas = [...horasBase].sort().reduce((acc, hora) => {
      const inicio = dayjs.tz(
        `${fecha} ${hora}`,
        "YYYY-MM-DD HH:mm",
        "America/Santiago",
      );

      if (fechaConsulta.isSame(ahora, "day") && inicio.isBefore(ahora))
        return acc;

      if (horasBloqueadas.includes(hora)) return acc;

      if (horasReservadas.includes(hora)) {
        acc.push({ hora, estado: "reservada" });
      } else if (horasDisponibles.has(hora) || horasExtra.includes(hora)) {
        acc.push({ hora, estado: "disponible" });
      }

      return acc;
    }, []);

    return res.json({
      fecha,
      duracionServicio,
      intervaloBase: horariosDelDia[0].duracionBloque,
      horas,
      diasPermitidos: suscripcionActiva
        ? dayjs(suscripcionActiva.fechaInicio)
            .tz("America/Santiago")
            .add(31, "day")
            .diff(ahora, "day")
        : 15,
    });
  } catch (error) {
    console.error("❌ Error getHorasDisponibles:", error);
    return res.status(500).json({ message: error.message });
  }
};

/** Crear horario y asignarlo al barbero */
export const createHorario = async (req, res) => {
  try {
    const {
      barbero,
      diaSemana,
      horaInicio,
      horaFin,
      colacionInicio,
      colacionFin,
      duracionBloque,
    } = req.body;

    if (
      !barbero ||
      diaSemana === undefined ||
      !horaInicio ||
      !horaFin ||
      !duracionBloque
    ) {
      return res.status(400).json({
        message: "Faltan campos obligatorios",
      });
    }

    let horario = await Horario.findOne({ barbero, diaSemana });

    if (horario) {
      // 🔁 Actualizar horario base
      horario.horaInicio = horaInicio;
      horario.horaFin = horaFin;
      horario.colacionInicio = colacionInicio;
      horario.colacionFin = colacionFin;
      horario.duracionBloque = duracionBloque || horario.duracionBloque;

      await horario.save();

      return res.status(200).json({
        message: "Horario base actualizado correctamente",
        horario,
      });
    }

    // 🆕 Crear nuevo horario base
    const nuevoHorario = await Horario.create({
      barbero,
      diaSemana,
      horaInicio,
      horaFin,
      colacionInicio,
      colacionFin,
      duracionBloque,
    });

    // (opcional) asociar al barbero
    await Usuario.findByIdAndUpdate(barbero, {
      $addToSet: { horariosDisponibles: nuevoHorario._id },
    });

    return res.status(201).json({
      message: "Horario base creado correctamente",
      horario: nuevoHorario,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

export const getHorariosByBarbero = async (req, res) => {
  try {
    const { barberoId } = req.params;

    const horarios = await horarioModel.find({ barbero: barberoId });

    if (!horarios.length) {
      return res.status(404).json({
        message: "El barbero aún no tiene un horario asignado",
      });
    }

    res.status(200).json(horarios);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteHorarioBarberoDia = async (req, res) => {
  try {
    const { barberoId, diaSemana } = req.params;

    if (!barberoId || diaSemana === undefined) {
      return res
        .status(400)
        .json({ message: "barbero o dia de semana no encontrado" });
    }

    const eliminado = await horarioModel.findOneAndDelete({
      barbero: barberoId,
      diaSemana: Number(diaSemana),
    });

    return res.status(200).json({
      message: eliminado ? "Horario eliminado" : "No existía horario",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// controllers/horario.controller.js

export const getHorarioBasePorDia = async (req, res) => {
  try {
    const { barberoId } = req.params;
    const { fecha } = req.query;

    if (!barberoId || !fecha) {
      return res.status(400).json({
        message: "barberoId y fecha son requeridos",
        bloques: [],
      });
    }

    // 🇨🇱 FECHA EN CHILE
    const fechaChile = dayjs.tz(
      `${fecha} 12:00`,
      "YYYY-MM-DD HH:mm",
      "America/Santiago",
    );

    if (!fechaChile.isValid()) {
      return res.status(400).json({
        message: "Fecha inválida",
        bloques: [],
      });
    }

    const diaSemana = fechaChile.day(); // 0 domingo - 6 sábado (CHILE)

    const horario = await Horario.findOne({
      barbero: barberoId,
      diaSemana,
    }).lean();

    if (!horario) {
      return res.status(200).json({
        bloques: [],
        message: "No hay horario base para este día",
      });
    }

    const bloques = generarBloquesDesdeHorario(horario);

    return res.status(200).json({ bloques });
  } catch (error) {
    console.error("❌ ERROR getHorarioBasePorDia:", error);
    return res.status(500).json({
      message: "Error interno del servidor",
      bloques: [],
    });
  }
};

// 🧹 FUNCIÓN ADICIONAL: Para limpiar datos corruptos
export const limpiarDatosCorruptos = async (req, res) => {
  try {
    // Buscar y eliminar registros con horaInicio corrupta
    const registrosCorruptos = await ExcepcionHorarioModel.find({
      $or: [
        { horaInicio: "[object Object]" },
        { horaInicio: { $type: "object" } },
        { horaInicio: { $not: { $regex: /^\d{2}:\d{2}$/ } } },
      ],
    });

    if (registrosCorruptos.length > 0) {
      const idsCorruptos = registrosCorruptos.map((r) => r._id);
      await ExcepcionHorarioModel.deleteMany({ _id: { $in: idsCorruptos } });

      res.json({
        message: `Se eliminaron ${registrosCorruptos.length} registros corruptos`,
        registrosEliminados: registrosCorruptos,
      });
    } else {
      res.json({ message: "No se encontraron registros corruptos" });
    }
  } catch (error) {
    console.error("❌ Error al limpiar datos:", error);
    res.status(500).json({ message: error.message });
  }
};

export const getProximaHoraDisponible = async (req, res) => {
  try {
    const DIAS_A_BUSCAR = 14;
    // Ahora en Chile
    const ahora = dayjs().tz("America/Santiago");

    let mejorSlot = null;

    // Obtener todos los horarios con la información del barbero
    const horarios = await Horario.find().populate("barbero", "nombre");

    // Ordenar horarios por prioridad (podrías ordenar por algún criterio)
    horarios.sort((a, b) => {
      // Priorizar barberos con más disponibilidad, o algún otro criterio
      return a.barbero.nombre.localeCompare(b.barbero.nombre);
    });

    // Buscar en los próximos días
    for (let d = 0; d < DIAS_A_BUSCAR; d++) {
      const diaActual = dayjs()
        .tz("America/Santiago")
        .add(d, "day")
        .startOf("day");
      const diaSemanaActual = diaActual.day(); // 0=domingo, 6=sábado

      // Buscar horarios que apliquen para este día de la semana
      const horariosDelDia = horarios.filter((h) => h.dia === diaSemanaActual);

      if (horariosDelDia.length === 0) {
        continue;
      }

      // Para cada barbero con horario este día
      for (const horario of horariosDelDia) {
        // Rango del día completo en UTC para consultas
        const inicioBusqueda = fechaConsulta
          .startOf("day")
          .subtract(4, "hour")
          .utc()
          .toDate();
        const finBusqueda = fechaConsulta
          .endOf("day")
          .add(4, "hour")
          .utc()
          .toDate();

        // Obtener reservas del barbero para este día
        const reservas = await Reserva.find({
          barbero: barberoId,
          fecha: {
            $gte: inicioBusqueda,
            $lt: finBusqueda,
          },
          estado: { $in: ["pendiente", "confirmada"] },
        });

        // 🔍 DEBUG TEMPORAL
        console.log("=== DEBUG RESERVAS ===");
        console.log("Fecha consultada:", fecha);
        console.log("inicioBusqueda:", inicioBusqueda);
        console.log("finBusqueda:", finBusqueda);
        console.log("Reservas encontradas:", reservas.length);
        reservas.forEach((r) => {
          console.log({
            fecha_utc: r.fecha,
            fecha_chile: dayjs(r.fecha)
              .tz("America/Santiago")
              .format("YYYY-MM-DD HH:mm"),
            duracion: r.duracion,
            estado: r.estado,
          });
        });
        console.log("======================");

        // Convertir reservas a horas en Chile
        const horasOcupadas = reservas.map((r) =>
          dayjs(r.fecha).tz("America/Santiago").format("HH:mm"),
        );

        // Verificar excepciones de horario (bloqueos/extra)
        const excepciones = await ExcepcionHorarioModel.find({
          barbero: barberoId,
          fecha: {
            $gte: inicioBusqueda, // reusar las mismas variables
            $lt: finBusqueda,
          },
        });

        // Filtrar excepciones válidas
        const excepcionesValidas = excepciones.filter(
          (excepcion) =>
            typeof excepcion.horaInicio === "string" &&
            /^\d{2}:\d{2}$/.test(excepcion.horaInicio),
        );

        const horasExtra = excepcionesValidas
          .filter((e) => e.tipo === "extra")
          .map((e) => e.horaInicio);

        const horasBloqueadas = excepcionesValidas
          .filter((e) => e.tipo === "bloqueo")
          .map((e) => e.horaInicio);

        // Procesar cada bloque del horario
        for (const bloque of horario.bloques) {
          // Generar horas para este bloque
          const horasGeneradas = generarHoras(bloque);

          for (const horaStr of horasGeneradas) {
            // Crear fecha completa en Chile
            const slotChile = dayjs.tz(
              `${diaActual.format("YYYY-MM-DD")} ${horaStr}`,
              "YYYY-MM-DD HH:mm",
              "America/Santiago",
            );

            // Convertir a UTC para comparar con "ahora"
            const slotUTC = slotChile.utc();
            const ahoraUTC = ahora.utc();

            // Verificar si el slot es en el futuro
            if (slotUTC.isBefore(ahoraUTC)) {
              continue;
            }

            // Verificar si está bloqueado por excepción
            if (horasBloqueadas.includes(horaStr)) {
              continue;
            }

            // Verificar si ya está reservado
            if (horasOcupadas.includes(horaStr)) {
              continue;
            }

            // Slot disponible encontrado!

            // Es el primer slot disponible o es más temprano que el anterior?
            if (!mejorSlot || slotUTC.isBefore(mejorSlot.fechaUTC)) {
              mejorSlot = {
                fechaChile: slotChile.toDate(),
                fechaUTC: slotUTC.toDate(),
                horaChile: horaStr,
                barbero: {
                  _id: horario.barbero._id,
                  nombre: horario.barbero.nombre || "Sin nombre",
                },
                dia: diaActual.format("YYYY-MM-DD"),
                diaNombre: diaActual.format("dddd"),
              };

              // Si encontramos un slot para hoy, salir inmediatamente
              // (podemos buscar el primero disponible sin seguir buscando)
              if (d === 0) {
                break;
              }
            }
          }

          // Si ya encontramos un slot y estamos en el primer día, podemos salir
          if (mejorSlot && d === 0) break;
        }

        // Si ya encontramos un slot, podemos salir del loop de barberos
        if (mejorSlot) break;
      }

      // Si ya encontramos un slot, podemos salir del loop de días
      if (mejorSlot) break;
    }

    if (!mejorSlot) {
      return res.status(404).json({
        message: "No hay horas disponibles en los próximos días",
        busquedaHasta: dayjs()
          .tz("America/Santiago")
          .add(DIAS_A_BUSCAR, "day")
          .format("YYYY-MM-DD"),
      });
    }

    // Formatear respuesta con hora chilena
    const fechaChileFormateada = dayjs(mejorSlot.fechaChile)
      .tz("America/Santiago")
      .format("YYYY-MM-DD HH:mm");

    const fechaLegible = dayjs(mejorSlot.fechaChile)
      .tz("America/Santiago")
      .format("dddd DD [de] MMMM [a las] HH:mm");

    return res.json({
      success: true,
      mensaje: "Próxima hora disponible encontrada",
      data: {
        fecha: fechaChileFormateada,
        fechaUTC: mejorSlot.fechaUTC,
        fechaLegible: fechaLegible,
        hora: dayjs(mejorSlot.fechaChile)
          .tz("America/Santiago")
          .format("HH:mm"),
        barbero: mejorSlot.barbero,
        dia: mejorSlot.dia,
        diaNombre: mejorSlot.diaNombre,
        timestamp: mejorSlot.fechaChile.getTime(),
        zonaHoraria: "America/Santiago",
      },
    });
  } catch (error) {
    console.error("🔥 Error en getProximaHoraDisponible:", error);
    res.status(500).json({
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};
