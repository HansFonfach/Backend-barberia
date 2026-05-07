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
import empresaModel from "../models/empresa.model.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

/* =====================================================
    FUNCIONES AUXILIARES
  ===================================================== */

const calcularHuecosDisponibles = (
  reservasDelDia,
  bloque,
  fecha,
  horasBloqueadas = [],
) => {
  const bloqueInicio = dayjs.isDayjs(bloque.inicio)
    ? bloque.inicio
    : dayjs.tz(
        `${fecha} ${bloque.inicio}`,
        "YYYY-MM-DD HH:mm",
        "America/Santiago",
      );

  const bloqueFin = dayjs.isDayjs(bloque.fin)
    ? bloque.fin
    : dayjs.tz(
        `${fecha} ${bloque.fin}`,
        "YYYY-MM-DD HH:mm",
        "America/Santiago",
      );

  // ✅ Reservas reales + horas bloqueadas como ocupaciones ficticias de 30 min
  const todasLasOcupaciones = [
    ...reservasDelDia.map((r) => {
      const inicio = dayjs(r.fecha).tz("America/Santiago");
      return { inicio, fin: inicio.add(r.duracion, "minute") };
    }),
    ...horasBloqueadas.map((hora) => {
      const inicio = dayjs.tz(
        `${fecha} ${hora}`,
        "YYYY-MM-DD HH:mm",
        "America/Santiago",
      );
      return { inicio, fin: inicio.add(30, "minute") };
    }),
  ]
    .filter((r) => r.fin.isAfter(bloqueInicio) && r.inicio.isBefore(bloqueFin))
    .sort((a, b) => a.inicio.diff(b.inicio));

  const huecos = [];
  let cursor = bloqueInicio;

  for (const r of todasLasOcupaciones) {
    const inicioOcupacion = r.inicio.isBefore(bloqueInicio)
      ? bloqueInicio
      : r.inicio;

    if (cursor.isBefore(inicioOcupacion)) {
      huecos.push({
        inicio: cursor,
        fin: inicioOcupacion,
        duracion: inicioOcupacion.diff(cursor, "minute"),
      });
    }

    if (r.fin.isAfter(cursor)) cursor = r.fin;
  }

  if (cursor.isBefore(bloqueFin)) {
    huecos.push({
      inicio: cursor,
      fin: bloqueFin,
      duracion: bloqueFin.diff(cursor, "minute"),
    });
  }

  return huecos;
};

/**
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
    const rolUsuario = req.usuario?.rol;

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

    if (feriado?.comportamiento === "bloquear_todo") {
      const fechaConsultaInicio = fechaConsulta
        .startOf("day")
        .subtract(4, "hour")
        .utc()
        .toDate();
      const fechaConsultaFin = fechaConsulta
        .endOf("day")
        .add(4, "hour")
        .utc()
        .toDate();

      const excepcionesFeriado = await ExcepcionHorarioModel.find({
        barbero: barberoId,
        fecha: { $gte: fechaConsultaInicio, $lt: fechaConsultaFin },
        tipo: "extra",
      });

      if (excepcionesFeriado.length === 0) {
        return res.json({
          fecha,
          horas: [],
          esFeriado: true,
          nombreFeriado: feriado.nombre,
          mensaje: `Feriado: ${feriado.nombre}. No se trabaja este día.`,
        });
      }

      const horasHabilitadas = excepcionesFeriado.map((e) => e.horaInicio);

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

      const reservas = await Reserva.find({
        barbero: barberoId,
        fecha: { $gte: inicioBusqueda, $lt: finBusqueda },
        estado: { $in: ["pendiente", "confirmada"] },
      });

      const horasReservadas = new Set(
        reservas.map((r) =>
          dayjs(r.fecha).tz("America/Santiago").format("HH:mm"),
        ),
      );

      const esPrivilegiado =
        req.usuario?.rol === "barbero" || req.usuario?.rol === "admin";

      const horas = horasHabilitadas
        .sort()
        .filter((hora) => {
          const inicio = dayjs.tz(
            `${fecha} ${hora}`,
            "YYYY-MM-DD HH:mm",
            "America/Santiago",
          );
          if (!esPrivilegiado && inicio.isBefore(ahora)) return false;
          return true;
        })
        .map((hora) => ({
          hora,
          estado: horasReservadas.has(hora) ? "reservada" : "disponible",
        }));

      return res.json({
        fecha,
        horas,
        esFeriado: true,
        nombreFeriado: feriado.nombre,
        mensaje: `Feriado: ${feriado.nombre}. Horas habilitadas por el barbero.`,
      });
    }

    /* ================= BARBERO ================= */
    const barbero = await Usuario.findById(barberoId).populate(
      "horariosDisponibles",
    );

    if (!barbero) {
      return res.status(404).json({ message: "Barbero no encontrado" });
    }

    /* ================= EMPRESA ================= */
    const empresaDoc = await empresaModel.findById(barbero.empresa);

    /* ================= SUSCRIPCIÓN ================= */
    let suscripcionActiva = null;

    if (usuario && empresaDoc?.permiteSuscripcion) {
      suscripcionActiva = await suscripcionModel.findOne({
        usuario: usuario.id,
        activa: true,
        fechaInicio: { $lte: new Date() },
        fechaFin: { $gte: new Date() },
      });
    }

    /* ================= LÍMITE DE DÍAS ================= */
    const diasPermitidos = empresaDoc?.diasMostradosCalendario ?? 15;
    const limiteNormal = ahora.add(diasPermitidos, "day").endOf("day");
    let limiteDias = limiteNormal;

    if (suscripcionActiva) {
      const limiteSuscripcion = dayjs(suscripcionActiva.fechaInicio)
        .tz("America/Santiago")
        .add(31, "day")
        .endOf("day");

      limiteDias = limiteSuscripcion.isAfter(limiteNormal)
        ? limiteSuscripcion
        : limiteNormal;
    }

    if (rolUsuario !== "barbero" && fechaConsulta.isAfter(limiteDias, "day")) {
      return res.status(400).json({
        message: suscripcionActiva
          ? "No puedes reservar más allá de los 31 días de tu suscripción"
          : `No puedes reservar con más de ${diasPermitidos} días de anticipación`,
      });
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

    const reservas = await Reserva.find({
      barbero: barberoId,
      fecha: {
        $gte: inicioBusqueda,
        $lt: finBusqueda,
      },
      estado: { $in: ["pendiente", "confirmada"] },
    });

    // 🔍 DEBUG: Reservas encontradas
    console.log("\n🔍 [DEBUG] ==============================");
    console.log(`📅 Fecha consultada: ${fecha}`);
    console.log(`⏱️  Duración servicio: ${duracionServicio} min`);
    console.log(`🗂️  Reservas encontradas (${reservas.length}):`);
    reservas.forEach((r) => {
      const horaLocal = dayjs(r.fecha).tz("America/Santiago").format("HH:mm");
      console.log(
        `   - ${horaLocal} | duración: ${r.duracion} min | estado: ${r.estado}`,
      );
    });

    const horasReservadas = reservas.map((r) =>
      dayjs(r.fecha).tz("America/Santiago").format("HH:mm"),
    );

    const vacacion = await ExcepcionHorarioModel.findOne({
      barbero: barberoId,
      tipo: "vacaciones",
      fechaInicio: { $lte: fechaConsulta.endOf("day").utc().toDate() },
      fechaFin: { $gte: fechaConsulta.startOf("day").utc().toDate() },
    });

    if (vacacion) {
      return res.json({
        fecha,
        horas: [],
        bloqueado: true,
        motivo: vacacion.motivo || "Vacaciones",
      });
    }

    /* ================= EXCEPCIONES ================= */
    const inicioDiaUTC = fechaConsulta.startOf("day").utc().toDate();

    const finDiaUTC = fechaConsulta.endOf("day").utc().toDate();

    const excepciones = await ExcepcionHorarioModel.find({
      barbero: barberoId,
      fecha: { $gte: inicioDiaUTC, $lte: finDiaUTC },
    });

    const bloqueoDia = excepciones.find((e) => e.tipo === "bloqueo_dia");
    if (bloqueoDia) {
      return res.json({
        fecha,
        horas: [],
        bloqueado: true,
        motivo: bloqueoDia.motivo || "Día bloqueado",
      });
    }

    const horasBloqueadas = excepciones
      .filter((e) => e.tipo === "bloqueo")
      .map((e) => e.horaInicio);

    const horasExtra = excepciones
      .filter((e) => e.tipo === "extra")
      .map((e) => e.horaInicio);

    // 🔍 DEBUG: Excepciones
    console.log(
      `🚫 Horas bloqueadas: [${horasBloqueadas.join(", ") || "ninguna"}]`,
    );
    console.log(`➕ Horas extra: [${horasExtra.join(", ") || "ninguna"}]`);

    /* ================= HORAS DISPONIBLES ================= */
    const horasDisponibles = new Set();
    const horasBase = new Set();
    const mapaPermitidos = {};

    for (const horario of horariosDelDia) {
      const intervalo = Number(horario.duracionBloque);

      // 🔍 DEBUG: Horario procesado
      console.log(
        `\n📋 Horario diaSemana=${horario.diaSemana} | ${horario.horaInicio}-${horario.horaFin} | colación: ${horario.colacionInicio || "sin"}-${horario.colacionFin || "colación"} | bloque: ${intervalo}min`,
      );

      // ✅ Construir bloques de trabajo separando colación
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

      // 🔍 DEBUG: Bloques de trabajo
      console.log("🧱 Bloques de trabajo (antes de anclas):");
      bloquesTrabajo.forEach((b) =>
        console.log(
          `   ${b.inicio.format("HH:mm")} → ${b.fin.format("HH:mm")}`,
        ),
      );

      const usaAncla =
        empresaDoc?.configuracion?.usaHorasAncla === true &&
        horario.horasAncla?.length > 0;

      console.log(`⚓ usaAncla: ${usaAncla}`);

      if (usaAncla) {
        horario.horasAncla.forEach((a) => {
          if (a.serviciosPermitidos?.length > 0) {
            mapaPermitidos[a.hora] = a.serviciosPermitidos.map((s) =>
              s.toString(),
            );
          }
        });
      }

      const dividirBloqueEnAnclas = (bloque, anclas, fecha) => {
        const anclasDentro = anclas
          .map((a) =>
            dayjs.tz(`${fecha} ${a}`, "YYYY-MM-DD HH:mm", "America/Santiago"),
          )
          .filter(
            (a) => a.isSameOrAfter(bloque.inicio) && a.isBefore(bloque.fin),
          )
          .sort((a, b) => a.diff(b));

        if (!anclasDentro.length) return [bloque];

        const subBloques = [];
        const puntos = [bloque.inicio, ...anclasDentro, bloque.fin];

        for (let i = 0; i < puntos.length - 1; i++) {
          subBloques.push({ inicio: puntos[i], fin: puntos[i + 1] });
        }

        return subBloques;
      };

      const bloquesEfectivos = (
        usaAncla
          ? bloquesTrabajo.flatMap((b) =>
              dividirBloqueEnAnclas(
                b,
                horario.horasAncla.map((a) => a.hora),
                fecha,
              ),
            )
          : bloquesTrabajo
      ).filter((b) => b.inicio.isBefore(b.fin));

      // 🔍 DEBUG: Bloques efectivos
      console.log("✅ Bloques efectivos (post-anclas, filtrados):");
      bloquesEfectivos.forEach((b) =>
        console.log(
          `   ${b.inicio.format("HH:mm")} → ${b.fin.format("HH:mm")}`,
        ),
      );

      // ===== GENERAR horasBase =====
      if (usaAncla) {
        for (const subBloque of bloquesEfectivos) {
          let cursor = subBloque.inicio;
          while (cursor.isBefore(subBloque.fin)) {
            horasBase.add(cursor.format("HH:mm"));
            cursor = cursor.add(intervalo, "minute");
          }
        }
      } else {
        // ✅ FIX: usar bloquesEfectivos en lugar de bloquesTrabajo
        // para que horasBase y horasDisponibles compartan la misma fuente
        for (const bloque of bloquesEfectivos) {
          let cursor = bloque.inicio;
          while (cursor.isBefore(bloque.fin)) {
            horasBase.add(cursor.format("HH:mm"));
            cursor = cursor.add(intervalo, "minute");
          }
        }
      }

      // ===== GENERAR horasDisponibles =====
      for (const bloque of bloquesEfectivos) {
        const huecos = calcularHuecosDisponibles(
          reservas,
          bloque,
          fecha,
          horasBloqueadas,
        );

        // 🔍 DEBUG: Huecos por bloque
        console.log(
          `\n   🕳️  Huecos en bloque ${bloque.inicio.format("HH:mm")}-${bloque.fin.format("HH:mm")}:`,
        );
        huecos.forEach((h) =>
          console.log(
            `      ${h.inicio.format("HH:mm")} → ${h.fin.format("HH:mm")} (${h.duracion} min) | servicio necesita ${duracionServicio} min → ${h.duracion >= duracionServicio ? "✅ CABE" : "❌ no cabe"}`,
          ),
        );

        for (const hueco of huecos) {
          if (hueco.duracion >= duracionServicio) {
            const inicios = generarIniciosEnHueco(
              hueco,
              intervalo,
              duracionServicio,
            );
            console.log(`      → Inicios generados: [${inicios.join(", ")}]`);
            inicios.forEach((hora) => {
              if (!horasBloqueadas.includes(hora)) {
                horasDisponibles.add(hora);
              }
            });
          }
        }
      }
    }

    // Agregar horas extra a horasDisponibles también
    horasExtra.forEach((h) => horasDisponibles.add(h));

    // 🔍 DEBUG: Resumen final
    console.log("\n📊 Resumen:");
    console.log(
      `   horasBase (${[...horasBase].length}): [${[...horasBase].sort().join(", ")}]`,
    );
    console.log(
      `   horasDisponibles (${horasDisponibles.size}): [${[...horasDisponibles].sort().join(", ")}]`,
    );
    console.log(`   horasReservadas: [${horasReservadas.join(", ")}]`);
    console.log("🔍 [DEBUG] ==============================\n");

    /* ================= RESPUESTA FINAL ================= */
    const esPrivilegiado = rolUsuario === "barbero" || rolUsuario === "admin";

    // ✅ FIX: iterar sobre la UNIÓN de horasDisponibles + horasReservadas
    // horasBase tenía el grid fijo (ej: 15:00, 15:45) pero horasDisponibles
    // genera inicios desde el hueco real (ej: 14:55, 15:40), que nunca coincidían.
    const todasLasHoras = new Set([...horasDisponibles, ...horasReservadas]);

    const horas = [...todasLasHoras].sort().reduce((acc, hora) => {
      const inicio = dayjs.tz(
        `${fecha} ${hora}`,
        "YYYY-MM-DD HH:mm",
        "America/Santiago",
      );

      // Filtrar horas pasadas para usuarios normales
      if (!esPrivilegiado && inicio.isBefore(ahora)) return acc;

      // Filtrar horas bloqueadas
      if (horasBloqueadas.includes(hora)) return acc;

      // Si la hora tiene servicio exclusivo y no coincide, omitir
      if (mapaPermitidos[hora] && !mapaPermitidos[hora].includes(servicioId))
        return acc;

      if (horasReservadas.includes(hora)) {
        acc.push({ hora, estado: "reservada" });
      } else {
        acc.push({ hora, estado: "disponible" });
      }

      return acc;
    }, []);

    return res.json({
      fecha,
      duracionServicio,
      intervaloBase: horariosDelDia[0].duracionBloque,
      horas,
      diasPermitidos: suscripcionActiva ? 31 : diasPermitidos,
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
      horasAncla, // 👈 nuevo campo opcional
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

      // ✅ Solo actualiza horasAncla si viene en el body
      if (Array.isArray(horasAncla)) {
        horario.horasAncla = horasAncla;
      }

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
      // ✅ Solo incluye horasAncla si viene y es array válido
      ...(Array.isArray(horasAncla) && { horasAncla }),
    });

    // asociar al barbero
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
        const inicioDiaUTC = diaActual.utc().startOf("day").toDate();
        const finDiaUTC = diaActual.utc().endOf("day").toDate();

        // Obtener reservas del barbero para este día
        const reservas = await Reserva.find({
          barbero: horario.barbero._id,
          fecha: { $gte: inicioDiaUTC, $lte: finDiaUTC },
          estado: { $in: ["pendiente", "confirmada"] },
        });

        // Convertir reservas a horas en Chile
        const horasOcupadas = reservas.map((r) =>
          dayjs(r.fecha).tz("America/Santiago").format("HH:mm"),
        );

        // Verificar excepciones de horario (bloqueos/extra)
        const excepciones = await ExcepcionHorarioModel.find({
          barbero: horario.barbero._id,
          fecha: { $gte: inicioDiaUTC, $lt: finDiaUTC },
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

export const getHorasProfesionalPorDia = async (req, res) => {
  try {
    const { id: barberoId } = req.params;
    const { fecha, servicioId } = req.query;

    if (!fecha) {
      return res.status(400).json({ message: "Fecha requerida" });
    }

    const fechaConsulta = dayjs.tz(fecha, "YYYY-MM-DD", "America/Santiago");
    if (!fechaConsulta.isValid()) {
      return res.status(400).json({ message: "Fecha inválida" });
    }

    // ─── BARBERO ───
    const barbero = await Usuario.findById(barberoId).populate(
      "horariosDisponibles",
    );
    if (!barbero)
      return res.status(404).json({ message: "Barbero no encontrado" });

    const empresaDoc = await empresaModel.findById(barbero.empresa);
    const diaSemana = fechaConsulta.day();

    const horariosDelDia = barbero.horariosDisponibles.filter(
      (h) => Number(h.diaSemana) === diaSemana,
    );

    // ─── FERIADO ───
    const feriado = await verificarFeriadoConComportamiento(fecha);

    // ─── RESERVAS DEL DÍA ───
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

    const reservas = await Reserva.find({
      barbero: barberoId,
      fecha: { $gte: inicioBusqueda, $lt: finBusqueda },
      estado: { $in: ["pendiente", "confirmada"] },
    })
      .populate("cliente", "nombre email telefono")
      .populate("servicio", "nombre");

    // Map rápido hora → reserva
    const mapaReservas = {};
    reservas.forEach((r) => {
      const hora = dayjs(r.fecha).tz("America/Santiago").format("HH:mm");
      mapaReservas[hora] = r;
    });

    // ─── EXCEPCIONES ───
    const inicioDiaUTC = fechaConsulta.startOf("day").utc().toDate();
    const finDiaUTC = fechaConsulta.endOf("day").utc().toDate();

    const excepciones = await ExcepcionHorarioModel.find({
      barbero: barberoId,
      fecha: { $gte: inicioDiaUTC, $lte: finDiaUTC },
    });

    const bloqueoDia = excepciones.find((e) => e.tipo === "bloqueo_dia");
    const horasBloqueadas = excepciones
      .filter((e) => e.tipo === "bloqueo")
      .map((e) => e.horaInicio);
    const horasExtra = excepciones
      .filter((e) => e.tipo === "extra")
      .map((e) => e.horaInicio);

    // ─── VACACIONES ───
    const vacacion = await ExcepcionHorarioModel.findOne({
      barbero: barberoId,
      tipo: "vacaciones",
      fechaInicio: { $lte: fechaConsulta.endOf("day").utc().toDate() },
      fechaFin: { $gte: fechaConsulta.startOf("day").utc().toDate() },
    });

    // ─── CONSTRUIR GRILLA ───
    const resultado = new Map(); // hora → { hora, estado, meta }

    // 1. Si día bloqueado o vacaciones → solo reservas existentes
    if (bloqueoDia || vacacion) {
      Object.entries(mapaReservas).forEach(([hora, r]) => {
        resultado.set(hora, {
          hora,
          estado: "reservada",
          reserva: _miniReserva(r),
          motivo: bloqueoDia?.motivo || vacacion?.motivo || "Día bloqueado",
        });
      });

      return res.json({
        fecha,
        bloqueado: true,
        motivo: bloqueoDia?.motivo || vacacion?.motivo,
        esFeriado: !!feriado,
        nombreFeriado: feriado?.nombre,
        horas: _ordenar(resultado),
      });
    }

    // 2. Horas del horario base
    for (const horario of horariosDelDia) {
      const intervalo = Number(horario.duracionBloque);

      // Horas de colación
      const colacionHoras = new Set();
      if (horario.colacionInicio && horario.colacionFin) {
        let c = dayjs.tz(
          `${fecha} ${horario.colacionInicio}`,
          "YYYY-MM-DD HH:mm",
          "America/Santiago",
        );
        const cFin = dayjs.tz(
          `${fecha} ${horario.colacionFin}`,
          "YYYY-MM-DD HH:mm",
          "America/Santiago",
        );
        while (c.isBefore(cFin)) {
          colacionHoras.add(c.format("HH:mm"));
          c = c.add(intervalo, "minute");
        }
      }

      // Recorrer horario completo (inicio → fin) con el intervalo
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
        const hora = cursor.format("HH:mm");

        if (!resultado.has(hora)) {
          if (colacionHoras.has(hora)) {
            resultado.set(hora, { hora, estado: "colacion" });
          } else if (horasBloqueadas.includes(hora)) {
            resultado.set(hora, { hora, estado: "bloqueada" });
          } else if (mapaReservas[hora]) {
            resultado.set(hora, {
              hora,
              estado: "reservada",
              reserva: _miniReserva(mapaReservas[hora]),
            });
          } else {
            resultado.set(hora, { hora, estado: "disponible" });
          }
        }

        cursor = cursor.add(intervalo, "minute");
      }
    }

    // 3. Horas extra (fuera del horario base)
    horasExtra.forEach((hora) => {
      if (mapaReservas[hora]) {
        resultado.set(hora, {
          hora,
          estado: "reservada",
          esExtra: true,
          reserva: _miniReserva(mapaReservas[hora]),
        });
      } else {
        resultado.set(hora, { hora, estado: "extra", esExtra: true });
      }
    });

    // 4. Reservas que no cayeron en ninguna hora base (edge case)
    Object.entries(mapaReservas).forEach(([hora, r]) => {
      if (!resultado.has(hora)) {
        resultado.set(hora, {
          hora,
          estado: "reservada",
          esExtra: true,
          reserva: _miniReserva(r),
        });
      }
    });

    return res.json({
      fecha,
      esFeriado: !!feriado,
      nombreFeriado: feriado?.nombre,
      sinHorario: horariosDelDia.length === 0,
      horas: _ordenar(resultado),
    });
  } catch (error) {
    console.error("❌ Error getHorasAdmin:", error);
    return res.status(500).json({ message: error.message });
  }
};

// ─── Helpers ───
const _miniReserva = (r) => ({
  _id: r._id,
  cliente: r.cliente
    ? {
        nombre: r.cliente.nombre,
        email: r.cliente.email,
        telefono: r.cliente.telefono,
      }
    : null,
  servicio: r.servicio?.nombre || null,
  duracion: r.duracion,
  estado: r.estado,
});

const _ordenar = (mapa) =>
  [...mapa.values()].sort((a, b) => a.hora.localeCompare(b.hora));
