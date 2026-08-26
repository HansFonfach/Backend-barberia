import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

import ClaseModel from "../models/clase.model.js";
import ExcepcionClaseModel from "../models/excepcionClase.model.js";
import FeriadoClaseBloqueoModel from "../models/feriadoClaseBloqueo.model.js";
import FeriadoModel from "../models/feriados.js";
import InscripcionClaseModel from "../models/inscripcionClase.model.js";
import MembresiaClaseModel from "../models/membresiaClase.model.js";
import UsuarioModel from "../models/usuario.model.js";
import EmpresaModel from "../models/empresa.model.js";
import { contarClasesUsadasMembresia } from "../helpers/contarClasesUsadasMembresia.js";
import { esRutValido, formatearRut, limpiarRut } from "../helpers/validarRut.js";
import { reservarCupoAtomico, liberarCupoAtomico } from "../helpers/cupoSesionHelper.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "America/Santiago";

/* =======================================================
   🟢 CRUD de Clases (plantillas)
======================================================= */

export const crearClase = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const {
      nombre,
      descripcion,
      instructor,
      duracion,
      cupoMaximo,
      color,
      precioPaseDiario,
      horarioSemanal,
      vigenciaDesde,
      vigenciaHasta,
    } = req.body;

    if (!nombre || !duracion || !cupoMaximo) {
      return res
        .status(400)
        .json({ message: "Nombre, duración y cupo máximo son obligatorios" });
    }

    if (!Array.isArray(horarioSemanal) || horarioSemanal.length === 0) {
      return res.status(400).json({
        message: "Debes indicar al menos un bloque de horario semanal",
      });
    }

    for (const bloque of horarioSemanal) {
      if (
        bloque.diaSemana === undefined ||
        bloque.diaSemana === null ||
        bloque.diaSemana < 0 ||
        bloque.diaSemana > 6 ||
        !bloque.horaInicio
      ) {
        return res.status(400).json({
          message: "Cada bloque de horario debe tener día (0-6) y hora de inicio",
        });
      }
    }

    const clase = await ClaseModel.create({
      empresa: empresaId,
      nombre,
      descripcion,
      instructor: instructor || null,
      duracion,
      cupoMaximo,
      color: color || null,
      precioPaseDiario: precioPaseDiario ?? null,
      horarioSemanal,
      vigenciaDesde: vigenciaDesde || null,
      vigenciaHasta: vigenciaHasta || null,
    });

    return res.status(201).json({ message: "Clase creada correctamente", clase });
  } catch (error) {
    console.error("Error al crear clase:", error);
    return res.status(500).json({ message: "Error interno al crear la clase" });
  }
};

/* =======================================================
   🌐 Catálogo público de clases (landing de la empresa, sin login) —
   mismo patrón que getServiciosPublicos/getBarberosPublico
======================================================= */
export const getClasesPublicas = async (req, res) => {
  try {
    const { slug } = req.params;

    const empresa = await EmpresaModel.findOne({ slug });
    if (!empresa || !empresa.modulos?.clasesGrupales) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    const clases = await ClaseModel.find({ empresa: empresa._id, activa: true })
      .populate("instructor", "nombre apellido")
      .select("nombre descripcion instructor duracion cupoMaximo horarioSemanal color precioPaseDiario")
      .sort({ nombre: 1 });

    return res.json({ clases });
  } catch (error) {
    console.error("Error al listar clases públicas:", error);
    return res.status(500).json({ message: "Error interno al listar las clases" });
  }
};

export const listarClases = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const { todas } = req.query;

    const filtro = { empresa: empresaId };
    if (todas !== "true") filtro.activa = true;

    const clases = await ClaseModel.find(filtro)
      .populate("instructor", "nombre apellido")
      .sort({ nombre: 1 });

    return res.json({ clases });
  } catch (error) {
    console.error("Error al listar clases:", error);
    return res.status(500).json({ message: "Error interno al listar las clases" });
  }
};

export const actualizarClase = async (req, res) => {
  try {
    const { id } = req.params;
    const empresaId = req.usuario.empresaId;

    const clase = await ClaseModel.findOne({ _id: id, empresa: empresaId });
    if (!clase) {
      return res.status(404).json({ message: "Clase no encontrada" });
    }

    const campos = [
      "nombre",
      "descripcion",
      "instructor",
      "duracion",
      "cupoMaximo",
      "color",
      "precioPaseDiario",
      "horarioSemanal",
      "vigenciaDesde",
      "vigenciaHasta",
    ];

    for (const campo of campos) {
      if (req.body[campo] !== undefined) {
        clase[campo] = req.body[campo];
      }
    }

    await clase.save();

    return res.json({ message: "Clase actualizada correctamente", clase });
  } catch (error) {
    console.error("Error al actualizar clase:", error);
    return res.status(500).json({ message: "Error interno al actualizar la clase" });
  }
};

export const toggleActivaClase = async (req, res) => {
  try {
    const { id } = req.params;
    const empresaId = req.usuario.empresaId;

    const clase = await ClaseModel.findOne({ _id: id, empresa: empresaId });
    if (!clase) {
      return res.status(404).json({ message: "Clase no encontrada" });
    }

    clase.activa = !clase.activa;
    await clase.save();

    return res.json({
      message: clase.activa ? "Clase activada" : "Clase desactivada",
      clase,
    });
  } catch (error) {
    console.error("Error al cambiar estado de la clase:", error);
    return res
      .status(500)
      .json({ message: "Error interno al cambiar el estado de la clase" });
  }
};

export const eliminarClase = async (req, res) => {
  try {
    const { id } = req.params;
    const empresaId = req.usuario.empresaId;

    const clase = await ClaseModel.findOne({ _id: id, empresa: empresaId });
    if (!clase) {
      return res.status(404).json({ message: "Clase no encontrada" });
    }

    const tieneInscripciones = await InscripcionClaseModel.exists({ clase: id });
    if (tieneInscripciones) {
      clase.activa = false;
      await clase.save();
      return res.json({
        message:
          "La clase tiene inscripciones registradas, así que se desactivó en vez de eliminarse (para no perder el historial)",
        clase,
      });
    }

    await ClaseModel.deleteOne({ _id: id });
    await ExcepcionClaseModel.deleteMany({ clase: id });

    return res.json({ message: "Clase eliminada correctamente" });
  } catch (error) {
    console.error("Error al eliminar clase:", error);
    return res.status(500).json({ message: "Error interno al eliminar la clase" });
  }
};

/* =======================================================
   🟣 Excepciones puntuales (cancelar o cambiar cupo de una fecha)
======================================================= */

export const crearExcepcionClase = async (req, res) => {
  try {
    const { id } = req.params; // claseId
    const empresaId = req.usuario.empresaId;
    const { fecha, tipo, cupoOverride, motivo } = req.body;

    if (!fecha || !tipo) {
      return res
        .status(400)
        .json({ message: "Debes indicar la fecha y el tipo de excepción" });
    }

    if (!["cancelada", "cupo_modificado", "forzar_habilitada"].includes(tipo)) {
      return res.status(400).json({ message: "Tipo de excepción inválido" });
    }

    if (
      tipo === "cupo_modificado" &&
      (cupoOverride === undefined || cupoOverride === null || cupoOverride < 0)
    ) {
      return res
        .status(400)
        .json({ message: "Debes indicar el nuevo cupo para esa fecha" });
    }

    const clase = await ClaseModel.findOne({ _id: id, empresa: empresaId });
    if (!clase) {
      return res.status(404).json({ message: "Clase no encontrada" });
    }

    const fechaDia = dayjs.tz(fecha, TZ).startOf("day").toDate();

    const excepcion = await ExcepcionClaseModel.findOneAndUpdate(
      { clase: id, fecha: fechaDia },
      {
        clase: id,
        fecha: fechaDia,
        tipo,
        cupoOverride: tipo === "cupo_modificado" ? cupoOverride : null,
        motivo: motivo || "",
      },
      { upsert: true, new: true, runValidators: true },
    );

    return res
      .status(201)
      .json({ message: "Excepción registrada correctamente", excepcion });
  } catch (error) {
    console.error("Error al crear excepción de clase:", error);
    return res
      .status(500)
      .json({ message: "Error interno al crear la excepción" });
  }
};

export const eliminarExcepcionClase = async (req, res) => {
  try {
    const { excepcionId } = req.params;

    const excepcion = await ExcepcionClaseModel.findByIdAndDelete(excepcionId);
    if (!excepcion) {
      return res.status(404).json({ message: "Excepción no encontrada" });
    }

    return res.json({ message: "Excepción eliminada correctamente" });
  } catch (error) {
    console.error("Error al eliminar excepción de clase:", error);
    return res
      .status(500)
      .json({ message: "Error interno al eliminar la excepción" });
  }
};

/* =======================================================
   🟠 Feriados aplicados al módulo de clases (por empresa)

   El listado de feriados en sí (fecha/nombre) es GLOBAL y se sigue
   administrando igual que siempre (feriadoController.js / feriadoRoutes.js,
   usado por el flujo de barbería) — acá solo se lee para mostrarlo en el
   calendario de clases. Lo que es propio de cada empresa es si ese feriado
   está BLOQUEADO para las clases o no (FeriadoClaseBloqueo); por defecto
   ningún feriado bloquea nada, tal como pide el negocio.
======================================================= */
export const listarFeriadosClases = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const { desde, hasta } = req.query;

    const inicio = desde
      ? dayjs.tz(desde, TZ).startOf("day")
      : dayjs().tz(TZ).startOf("day");
    const fin = hasta
      ? dayjs.tz(hasta, TZ).endOf("day")
      : inicio.add(60, "day").endOf("day");

    const [feriados, bloqueos] = await Promise.all([
      FeriadoModel.find({
        fecha: { $gte: inicio.toDate(), $lte: fin.toDate() },
      })
        .sort({ fecha: 1 })
        .lean(),
      FeriadoClaseBloqueoModel.find({
        empresa: empresaId,
        fecha: { $gte: inicio.toDate(), $lte: fin.toDate() },
      }).lean(),
    ]);

    const bloqueoPorFecha = new Map(
      bloqueos.map((b) => [dayjs(b.fecha).tz(TZ).format("YYYY-MM-DD"), b]),
    );

    const resultado = feriados.map((f) => {
      const key = dayjs(f.fecha).tz(TZ).format("YYYY-MM-DD");
      const bloqueo = bloqueoPorFecha.get(key);
      return {
        _id: f._id,
        fecha: f.fecha,
        nombre: f.nombre,
        bloqueado: !!bloqueo,
        motivoBloqueo: bloqueo?.motivo || "",
      };
    });

    return res.json({ feriados: resultado });
  } catch (error) {
    console.error("Error al listar feriados de clases:", error);
    return res
      .status(500)
      .json({ message: "Error interno al listar los feriados" });
  }
};

export const bloquearFeriadoClase = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const { fecha } = req.params;
    const { motivo } = req.body;

    if (!fecha || Number.isNaN(new Date(fecha).getTime())) {
      return res.status(400).json({ message: "Fecha inválida" });
    }

    const fechaDia = dayjs.tz(fecha, TZ).startOf("day").toDate();

    const bloqueo = await FeriadoClaseBloqueoModel.findOneAndUpdate(
      { empresa: empresaId, fecha: fechaDia },
      { empresa: empresaId, fecha: fechaDia, motivo: motivo || "" },
      { upsert: true, new: true, runValidators: true },
    );

    return res
      .status(201)
      .json({ message: "Día bloqueado correctamente", bloqueo });
  } catch (error) {
    console.error("Error al bloquear feriado de clases:", error);
    return res
      .status(500)
      .json({ message: "Error interno al bloquear el día" });
  }
};

export const desbloquearFeriadoClase = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const { fecha } = req.params;

    if (!fecha || Number.isNaN(new Date(fecha).getTime())) {
      return res.status(400).json({ message: "Fecha inválida" });
    }

    const fechaDia = dayjs.tz(fecha, TZ).startOf("day").toDate();

    await FeriadoClaseBloqueoModel.deleteOne({
      empresa: empresaId,
      fecha: fechaDia,
    });

    return res.json({ message: "Día desbloqueado correctamente" });
  } catch (error) {
    console.error("Error al desbloquear feriado de clases:", error);
    return res
      .status(500)
      .json({ message: "Error interno al desbloquear el día" });
  }
};

/* =======================================================
   🔵 Sesiones disponibles (se generan a partir del horario semanal)
======================================================= */

/* =======================================================
   Genera la lista de sesiones (ocurrencias reales de cada clase dentro de
   un rango de fechas) a partir del horario semanal + excepciones +
   inscritos. Extraído como helper puro para poder reutilizar EXACTAMENTE
   la misma lógica tanto desde el endpoint autenticado (getSesionesDisponibles)
   como desde el público para invitados (getSesionesPublicas) — nada de
   duplicar esto a mano y arriesgar que un endpoint muestre cupos distintos
   al otro.
======================================================= */
export const generarSesionesDisponibles = async ({
  empresaId,
  desde,
  hasta,
  claseId,
  incluirPasadas,
}) => {
  const mostrarPasadas = incluirPasadas === "true" || incluirPasadas === true;

  const inicio = desde
    ? dayjs.tz(desde, TZ).startOf("day")
    : dayjs().tz(TZ).startOf("day");
  const fin = hasta
    ? dayjs.tz(hasta, TZ).endOf("day")
    : inicio.add(13, "day").endOf("day");

  if (fin.isBefore(inicio)) {
    return { error: { status: 400, message: "El rango de fechas es inválido" } };
  }

  const filtroClases = { empresa: empresaId, activa: true };
  if (claseId) filtroClases._id = claseId;

  const clases = await ClaseModel.find(filtroClases)
    .populate("instructor", "nombre apellido")
    .lean();

  if (!clases.length) return { sesiones: [] };

  const claseIds = clases.map((c) => c._id);

  const [excepciones, inscripciones, bloqueosFeriado] = await Promise.all([
    ExcepcionClaseModel.find({
      clase: { $in: claseIds },
      fecha: { $gte: inicio.toDate(), $lte: fin.toDate() },
    }).lean(),
    InscripcionClaseModel.find({
      clase: { $in: claseIds },
      fecha: { $gte: inicio.toDate(), $lte: fin.toDate() },
      estado: "confirmada",
    }).lean(),
    FeriadoClaseBloqueoModel.find({
      empresa: empresaId,
      fecha: { $gte: inicio.toDate(), $lte: fin.toDate() },
    }).lean(),
  ]);

  const excepcionPorClaseFecha = new Map();
  for (const ex of excepciones) {
    const key = `${ex.clase}_${dayjs(ex.fecha).tz(TZ).format("YYYY-MM-DD")}`;
    excepcionPorClaseFecha.set(key, ex);
  }

  // Fechas bloqueadas por feriado a nivel de empresa (ver FeriadoClaseBloqueo)
  const fechasBloqueadas = new Set(
    bloqueosFeriado.map((b) => dayjs(b.fecha).tz(TZ).format("YYYY-MM-DD")),
  );

  const inscritosPorSesion = new Map();
  for (const ins of inscripciones) {
    const key = `${ins.clase}_${dayjs(ins.fecha).toISOString()}`;
    inscritosPorSesion.set(key, (inscritosPorSesion.get(key) || 0) + 1);
  }

  const sesiones = [];

  for (const clase of clases) {
    if (!clase.horarioSemanal?.length) continue;

    const vigenciaDesde = clase.vigenciaDesde
      ? dayjs(clase.vigenciaDesde).tz(TZ).startOf("day")
      : null;
    const vigenciaHasta = clase.vigenciaHasta
      ? dayjs(clase.vigenciaHasta).tz(TZ).endOf("day")
      : null;

    let cursor = inicio.clone();

    while (!cursor.isAfter(fin)) {
      const diaSemana = cursor.day();
      const bloquesDia = clase.horarioSemanal.filter(
        (h) => h.diaSemana === diaSemana,
      );

      for (const bloque of bloquesDia) {
        const [hh, mm] = bloque.horaInicio.split(":").map(Number);
        const fechaSesion = cursor.hour(hh).minute(mm).second(0).millisecond(0);

        if (vigenciaDesde && fechaSesion.isBefore(vigenciaDesde)) continue;
        if (vigenciaHasta && fechaSesion.isAfter(vigenciaHasta)) continue;
        // Por defecto no se muestran sesiones ya pasadas (flujo de inscripción del
        // cliente); con incluirPasadas=true (vista de admin tipo "clases del día")
        // sí se listan, para poder revisar la asistencia de un día anterior.
        if (!mostrarPasadas && fechaSesion.isBefore(dayjs().tz(TZ))) continue;

        const excepcion = excepcionPorClaseFecha.get(
          `${clase._id}_${fechaSesion.format("YYYY-MM-DD")}`,
        );

        if (excepcion?.tipo === "cancelada") continue;

        // Día bloqueado por feriado (a nivel de empresa): se omite la sesión
        // salvo que esta clase puntual tenga una excepción "forzar_habilitada"
        // para esa fecha.
        if (
          fechasBloqueadas.has(fechaSesion.format("YYYY-MM-DD")) &&
          excepcion?.tipo !== "forzar_habilitada"
        )
          continue;

        const cupoEfectivo =
          excepcion?.tipo === "cupo_modificado" && excepcion.cupoOverride != null
            ? excepcion.cupoOverride
            : clase.cupoMaximo;

        const inscritos =
          inscritosPorSesion.get(`${clase._id}_${fechaSesion.toISOString()}`) ||
          0;

        sesiones.push({
          claseId: clase._id,
          nombre: clase.nombre,
          descripcion: clase.descripcion,
          instructor: clase.instructor,
          duracion: clase.duracion,
          color: clase.color,
          fecha: fechaSesion.toDate(),
          cupoMaximo: cupoEfectivo,
          inscritos,
          cuposDisponibles: Math.max(cupoEfectivo - inscritos, 0),
          lleno: inscritos >= cupoEfectivo,
          precioPaseDiario: clase.precioPaseDiario,
        });
      }

      cursor = cursor.add(1, "day");
    }
  }

  sesiones.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  return { sesiones };
};

export const getSesionesDisponibles = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const { desde, hasta, claseId, incluirPasadas } = req.query;

    const resultado = await generarSesionesDisponibles({
      empresaId,
      desde,
      hasta,
      claseId,
      incluirPasadas,
    });

    if (resultado.error) {
      return res.status(resultado.error.status).json({ message: resultado.error.message });
    }

    return res.json({ sesiones: resultado.sesiones });
  } catch (error) {
    console.error("Error al obtener sesiones de clases:", error);
    return res
      .status(500)
      .json({ message: "Error interno al obtener las sesiones" });
  }
};

/* =======================================================
   🌐 Sesiones disponibles SIN login, para que un visitante pueda ver
   horarios y cupo antes de agendar su clase de prueba gratis. Mismo
   resultado que getSesionesDisponibles, resuelto por slug en vez de por
   el token — nunca expone nada que no exponga ya el catálogo público.
======================================================= */
export const getSesionesPublicas = async (req, res) => {
  try {
    const { slug } = req.params;
    const { desde, hasta, claseId } = req.query;

    const empresa = await EmpresaModel.findOne({ slug });
    if (!empresa || !empresa.modulos?.clasesGrupales) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    const resultado = await generarSesionesDisponibles({
      empresaId: empresa._id,
      desde,
      hasta,
      claseId,
      incluirPasadas: false,
    });

    if (resultado.error) {
      return res.status(resultado.error.status).json({ message: resultado.error.message });
    }

    return res.json({ sesiones: resultado.sesiones });
  } catch (error) {
    console.error("Error al obtener sesiones públicas de clases:", error);
    return res
      .status(500)
      .json({ message: "Error interno al obtener las sesiones" });
  }
};

/* =======================================================
   🟡 Inscripciones

   Núcleo común reutilizado por los TRES puntos de entrada (cliente logueado,
   invitado con clase de prueba gratis, invitado con RUT+membresía): resolver
   la sesión → validar el acceso (membresía/prueba gratis/pase día) → reservar
   cupo de forma atómica → crear la inscripción. Así ningún camino puede
   terminar con reglas distintas ni con una condición de carrera que el otro
   no tenga — exactamente lo que antes pasaba con
   inscribirPruebaGratisInvitado, que duplicaba a mano toda esta lógica.
======================================================= */

// Encuentra la clase, valida que la fecha corresponda a un bloque real de su
// horario semanal, revisa excepciones puntuales (cancelada / cupo modificado)
// y devuelve el cupo efectivo para esa sesión. Usado por los tres flujos.
const resolverSesionValida = async ({ empresaId, claseId, fecha }) => {
  const clase = await ClaseModel.findOne({
    _id: claseId,
    empresa: empresaId,
    activa: true,
  });
  if (!clase) return { error: { status: 404, message: "Clase no encontrada" } };

  const fechaSesion = new Date(fecha);
  if (Number.isNaN(fechaSesion.getTime())) {
    return { error: { status: 400, message: "Fecha de sesión inválida" } };
  }

  const diaSemana = dayjs(fechaSesion).tz(TZ).day();
  const horaSesion = dayjs(fechaSesion).tz(TZ).format("HH:mm");
  const existeBloque = clase.horarioSemanal.some(
    (h) => h.diaSemana === diaSemana && h.horaInicio === horaSesion,
  );
  if (!existeBloque) {
    return {
      error: {
        status: 400,
        message: "Esa fecha/hora no corresponde a una sesión válida de esta clase",
      },
    };
  }

  const inicioDia = dayjs(fechaSesion).tz(TZ).startOf("day").toDate();
  const finDia = dayjs(fechaSesion).tz(TZ).endOf("day").toDate();
  const excepcion = await ExcepcionClaseModel.findOne({
    clase: clase._id,
    fecha: { $gte: inicioDia, $lte: finDia },
  });
  if (excepcion?.tipo === "cancelada") {
    return { error: { status: 409, message: "Esta sesión fue cancelada" } };
  }

  // Día bloqueado por feriado para el módulo de clases de esta empresa,
  // salvo que esta clase puntual esté forzada a mantenerse habilitada.
  if (excepcion?.tipo !== "forzar_habilitada") {
    const bloqueo = await FeriadoClaseBloqueoModel.findOne({
      empresa: empresaId,
      fecha: { $gte: inicioDia, $lte: finDia },
    });
    if (bloqueo) {
      return {
        error: { status: 409, message: "Este día está bloqueado por feriado" },
      };
    }
  }

  const cupoEfectivo =
    excepcion?.tipo === "cupo_modificado" && excepcion.cupoOverride != null
      ? excepcion.cupoOverride
      : clase.cupoMaximo;

  return { clase, fechaSesion, cupoEfectivo };
};

// Valida el tipo de acceso, reserva el cupo de forma atómica y crea la
// inscripción. Devuelve { inscripcion } o { error: { status, message } }.
const procesarInscripcion = async ({
  empresaId,
  clase,
  clienteId,
  fechaSesion,
  cupoEfectivo,
  tipoAcceso,
  monto,
  metodo,
}) => {
  let pago = { estado: "no_aplica", monto: 0, metodo: null };

  if (tipoAcceso === "membresia") {
    const membresia = await MembresiaClaseModel.findOne({
      empresa: empresaId,
      cliente: clienteId,
      activa: true,
      fechaInicio: { $lte: fechaSesion },
      fechaFin: { $gte: fechaSesion },
    });
    if (!membresia) {
      return {
        error: { status: 400, message: "No tienes una mensualidad activa para esa fecha" },
      };
    }

    // La mensualidad NO es ilimitada: tiene un cupo fijo (mensual o total
    // según el plan — ver contarClasesUsadasMembresia)
    const clasesUsadas = await contarClasesUsadasMembresia(membresia);
    if (clasesUsadas >= membresia.clasesIncluidas) {
      return {
        error: {
          status: 409,
          message:
            membresia.tipoCiclo === "mensual"
              ? "Ya usaste todas las clases incluidas en tu plan este mes"
              : "Ya usaste todas las clases incluidas en tu plan",
        },
      };
    }
  } else if (tipoAcceso === "prueba_gratis") {
    const yaUsoPrueba = await InscripcionClaseModel.findOne({
      empresa: empresaId,
      cliente: clienteId,
      tipoAcceso: "prueba_gratis",
      estado: { $ne: "cancelada" },
    });
    if (yaUsoPrueba) {
      return { error: { status: 409, message: "Ya usaste tu clase de prueba gratis" } };
    }
  } else if (tipoAcceso === "pase_dia") {
    // Si no mandan un monto puntual, se usa el precio de pase diario
    // configurado en la clase (si el admin lo definió)
    const montoFinal =
      monto !== undefined && monto !== null ? monto : clase.precioPaseDiario || 0;
    pago = { estado: "pendiente", monto: montoFinal, metodo: metodo || null };
  } else {
    return { error: { status: 400, message: "Tipo de acceso inválido" } };
  }

  // Duplicado: mismo cliente, misma sesión (defensa en profundidad además del
  // índice único de InscripcionClase — ver el catch más abajo)
  const inscripcionExistente = await InscripcionClaseModel.findOne({
    clase: clase._id,
    fecha: fechaSesion,
    cliente: clienteId,
    estado: { $ne: "cancelada" },
  });
  if (inscripcionExistente) {
    return { error: { status: 409, message: "Ya estás inscrito en esta sesión" } };
  }

  // Cupo: reserva ATÓMICA antes de crear la inscripción. Antes esto se hacía
  // con un countDocuments seguido de un create — dos solicitudes simultáneas
  // por el último cupo podían pasar ambas la validación y sobrevender el
  // cupo. reservarCupoAtomico usa un $inc condicionado de Mongo, así que solo
  // una de las dos puede ganar.
  const cupoReservado = await reservarCupoAtomico(clase._id, fechaSesion, cupoEfectivo);
  if (!cupoReservado) {
    return { error: { status: 409, message: "No hay cupos disponibles para esta sesión" } };
  }

  try {
    const inscripcion = await InscripcionClaseModel.create({
      empresa: empresaId,
      clase: clase._id,
      cliente: clienteId,
      fecha: fechaSesion,
      estado: "confirmada",
      tipoAcceso,
      pago,
    });
    return { inscripcion };
  } catch (error) {
    // Si la creación falló (p.ej. carrera con el índice único de
    // clase+fecha+cliente), liberamos el cupo que habíamos reservado para no
    // dejar un cupo "fantasma" ocupado por una inscripción que no existe.
    await liberarCupoAtomico(clase._id, fechaSesion);
    if (error?.code === 11000) {
      return { error: { status: 409, message: "Ya estás inscrito en esta sesión" } };
    }
    throw error;
  }
};

// Encuentra o crea un cliente "invitado" (sin contraseña) por RUT, para los
// flujos públicos que no requieren cuenta. Si el RUT ya pertenece a una
// cuenta real (cliente/admin/barbero), NO se deja pasar como invitado — debe
// iniciar sesión. Evita que cualquiera use el RUT de otra persona para
// crearle actividad en el sistema sin loguearse.
const resolverClienteInvitadoPorRut = async ({
  empresaId,
  rut,
  nombre,
  apellido,
  email,
  telefono,
}) => {
  let cliente = await UsuarioModel.findOne({ empresa: empresaId, rut });
  if (!cliente) {
    const rutLimpioBuscado = limpiarRut(rut);
    const usuariosEmpresa = await UsuarioModel.find({ empresa: empresaId });
    cliente = usuariosEmpresa.find(
      (u) => u.rut && limpiarRut(u.rut) === rutLimpioBuscado,
    );
  }

  if (cliente && cliente.rol !== "invitado") {
    return {
      error: {
        status: 409,
        body: {
          code: "CUENTA_EXISTENTE",
          message: "Ya tienes una cuenta con nosotros. Inicia sesión para continuar.",
        },
      },
    };
  }

  if (!cliente) {
    cliente = await UsuarioModel.create({
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      rut,
      email,
      telefono: telefono.trim(),
      rol: "invitado",
      empresa: empresaId,
    });
  } else {
    cliente.nombre = nombre.trim();
    cliente.apellido = apellido.trim();
    cliente.email = email;
    cliente.telefono = telefono.trim();
    await cliente.save();
  }

  return { cliente };
};

const soloDigitos = (valor) => String(valor || "").replace(/\D/g, "");

export const inscribirCliente = async (req, res) => {
  try {
    const { id } = req.params; // claseId
    const { fecha, tipoAcceso, clienteId, monto, metodo } = req.body;
    const empresaId = req.usuario.empresaId;
    const esAdmin = !!req.usuario.esAdmin;

    if (!fecha || !tipoAcceso) {
      return res.status(400).json({
        message: "Debes indicar la fecha de la sesión y el tipo de acceso",
      });
    }

    // Un admin puede inscribir a cualquier cliente de su empresa; un cliente solo se inscribe a sí mismo
    const clienteObjetivoId = esAdmin && clienteId ? clienteId : req.usuario.id;

    const cliente = await UsuarioModel.findOne({
      _id: clienteObjetivoId,
      empresa: empresaId,
    });
    if (!cliente) {
      return res.status(404).json({ message: "Cliente no encontrado en esta empresa" });
    }

    const sesion = await resolverSesionValida({ empresaId, claseId: id, fecha });
    if (sesion.error) {
      return res.status(sesion.error.status).json({ message: sesion.error.message });
    }

    const resultado = await procesarInscripcion({
      empresaId,
      clase: sesion.clase,
      clienteId: clienteObjetivoId,
      fechaSesion: sesion.fechaSesion,
      cupoEfectivo: sesion.cupoEfectivo,
      tipoAcceso,
      // El monto/método de un "pase_dia" solo puede venir del body cuando
      // quien llama es admin (ej. registrando un pago en efectivo con algún
      // ajuste puntual). Antes se aceptaba tal cual de cualquier cliente
      // logueado: como este endpoint no tiene verificarRol("esAdmin"), un
      // cliente podía mandar monto:1 y quedarse con un pase_dia casi gratis.
      // Para un cliente normal, procesarInscripcion cae siempre al
      // clase.precioPaseDiario configurado por el admin.
      monto: esAdmin ? monto : undefined,
      metodo: esAdmin ? metodo : undefined,
    });
    if (resultado.error) {
      return res.status(resultado.error.status).json({ message: resultado.error.message });
    }

    return res.status(201).json({
      message: "Inscripción registrada correctamente",
      inscripcion: resultado.inscripcion,
    });
  } catch (error) {
    console.error("Error al inscribir en clase:", error);
    return res
      .status(500)
      .json({ message: "Error interno al inscribir en la clase" });
  }
};

/* =======================================================
   🆓 Agendar la clase de prueba gratis SIN crear cuenta (mismo espíritu que
   reservarComoInvitado del módulo de reservas de barbería, pero mucho más
   restringido a propósito):

   - Esta ruta es pública (sin validarToken) y SOLO puede crear una
     inscripción con tipoAcceso "prueba_gratis". Nunca "membresia" ni
     "pase_dia" — eso sigue exigiendo cuenta y login, porque ahí sí hay
     plata o cupos de un plan pagado de por medio.
   - Si el RUT ingresado ya pertenece a una cuenta con contraseña (cliente,
     admin o barbero), NO se deja pasar como invitado: se le pide iniciar
     sesión. Así nadie puede usar el RUT de otra persona para sacarle su
     prueba gratis (o peor, intentar tocar su mensualidad) sin loguearse.
   - Si el RUT no existe o es de un invitado anterior, se crea/reutiliza
     ese usuario invitado (igual que ya hace la barbería).

   Delega la validación de sesión/cupo/duplicados a resolverSesionValida y
   procesarInscripcion — el mismo núcleo que usa inscribirCliente — para que
   este flujo nunca pueda terminar con reglas distintas al logueado.
======================================================= */
export const inscribirPruebaGratisInvitado = async (req, res) => {
  try {
    const { slug } = req.params;
    const { nombre, apellido, telefono, claseId, fecha } = req.body;
    const rutIngresado = req.body.rut;
    const email = String(req.body.email || "")
      .toLowerCase()
      .trim();

    if (
      !nombre?.trim() ||
      !apellido?.trim() ||
      !rutIngresado ||
      !telefono?.trim() ||
      !email ||
      !claseId ||
      !fecha
    ) {
      return res.status(400).json({
        message: "Completa todos los datos para agendar tu clase de prueba",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "El correo ingresado no es válido" });
    }

    if (!esRutValido(rutIngresado)) {
      return res.status(400).json({ message: "El RUT ingresado no es válido" });
    }
    const rut = formatearRut(rutIngresado);

    const empresa = await EmpresaModel.findOne({ slug });
    if (!empresa || !empresa.modulos?.clasesGrupales) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    const { cliente, error: identidadError } = await resolverClienteInvitadoPorRut({
      empresaId: empresa._id,
      rut,
      nombre,
      apellido,
      email,
      telefono,
    });
    if (identidadError) {
      return res.status(identidadError.status).json(identidadError.body);
    }

    const sesion = await resolverSesionValida({ empresaId: empresa._id, claseId, fecha });
    if (sesion.error) {
      return res.status(sesion.error.status).json({ message: sesion.error.message });
    }

    const resultado = await procesarInscripcion({
      empresaId: empresa._id,
      clase: sesion.clase,
      clienteId: cliente._id,
      fechaSesion: sesion.fechaSesion,
      cupoEfectivo: sesion.cupoEfectivo,
      tipoAcceso: "prueba_gratis",
    });
    if (resultado.error) {
      return res.status(resultado.error.status).json({ message: resultado.error.message });
    }

    return res
      .status(201)
      .json({ message: "¡Tu clase de prueba quedó agendada!", inscripcion: resultado.inscripcion });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        message: "Ya existe una cuenta o inscripción con esos datos",
      });
    }
    console.error("Error al agendar prueba gratis de invitado:", error);
    return res
      .status(500)
      .json({ message: "Error interno al agendar tu clase de prueba" });
  }
};

/* =======================================================
   🌐 Reservar una clase SIN login, con o sin membresía (RUT como identidad):

     Clase → Horario → RUT (+ verificación) → Reservar

   - Si el RUT pertenece a un cliente con una MEMBRESÍA ACTIVA para esa
     fecha, se le pide ADEMÁS su teléfono o correo registrado (segundo
     factor). Sin eso, cualquiera que supiera el RUT de un socio podría
     reservarle una clase y gastarle un cupo sin su consentimiento — el
     mismo riesgo no existe hoy en las reservas de invitado de la barbería
     porque ahí no hay "cupos pagados" de por medio, pero acá sí.
   - Si no hay membresía activa (o el RUT no existe todavía), cae al mismo
     camino que la clase de prueba gratis con invitado: mismas reglas, mismo
     bloqueo si el RUT ya es de una cuenta real (debe iniciar sesión).
   - En ambos casos, la reserva en sí (validar cupo, duplicados, descontar
     la clase) pasa por el MISMO núcleo (resolverSesionValida +
     procesarInscripcion) que usa el cliente logueado — cero lógica
     duplicada entre logueado y sin login.
======================================================= */
export const inscribirClasePublica = async (req, res) => {
  try {
    const { slug } = req.params;
    const { claseId, fecha, telefono, email, nombre, apellido } = req.body;
    const rutIngresado = req.body.rut;

    if (!rutIngresado || !claseId || !fecha) {
      return res
        .status(400)
        .json({ message: "Debes indicar tu RUT, la clase y el horario" });
    }
    if (!esRutValido(rutIngresado)) {
      return res.status(400).json({ message: "El RUT ingresado no es válido" });
    }
    const rut = formatearRut(rutIngresado);

    const empresa = await EmpresaModel.findOne({ slug });
    if (!empresa || !empresa.modulos?.clasesGrupales) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    const sesion = await resolverSesionValida({ empresaId: empresa._id, claseId, fecha });
    if (sesion.error) {
      return res.status(sesion.error.status).json({ message: sesion.error.message });
    }

    // ¿Existe un usuario con ese RUT en esta empresa? (mismo fallback que
    // getUsuarioByRutPublico, por si quedó guardado con puntos/guión distinto)
    let usuarioExistente = await UsuarioModel.findOne({ empresa: empresa._id, rut });
    if (!usuarioExistente) {
      const rutLimpioBuscado = limpiarRut(rut);
      const usuariosEmpresa = await UsuarioModel.find({ empresa: empresa._id });
      usuarioExistente = usuariosEmpresa.find(
        (u) => u.rut && limpiarRut(u.rut) === rutLimpioBuscado,
      );
    }

    const membresiaActiva = usuarioExistente
      ? await MembresiaClaseModel.findOne({
          empresa: empresa._id,
          cliente: usuarioExistente._id,
          activa: true,
          fechaInicio: { $lte: sesion.fechaSesion },
          fechaFin: { $gte: sesion.fechaSesion },
        })
      : null;

    if (usuarioExistente && membresiaActiva) {
      // 🔒 Segundo factor: reservar con el cupo de una membresía usando solo
      // el RUT no es suficientemente seguro (cualquiera puede saber el RUT
      // de otra persona), así que pedimos que además coincida el teléfono o
      // el correo que esa persona tiene registrado.
      const telefonoCoincide =
        telefono && soloDigitos(telefono) === soloDigitos(usuarioExistente.telefono);
      const emailCoincide =
        email &&
        String(email).toLowerCase().trim() ===
          String(usuarioExistente.email || "").toLowerCase().trim();

      if (!telefonoCoincide && !emailCoincide) {
        return res.status(403).json({
          code: "VERIFICACION_REQUERIDA",
          message:
            "No pudimos verificar tu identidad. Ingresa el teléfono o correo con el que estás registrado.",
        });
      }

      const resultado = await procesarInscripcion({
        empresaId: empresa._id,
        clase: sesion.clase,
        clienteId: usuarioExistente._id,
        fechaSesion: sesion.fechaSesion,
        cupoEfectivo: sesion.cupoEfectivo,
        tipoAcceso: "membresia",
      });
      if (resultado.error) {
        return res.status(resultado.error.status).json({ message: resultado.error.message });
      }
      return res.status(201).json({
        message: "Inscripción registrada correctamente",
        inscripcion: resultado.inscripcion,
      });
    }

    // Sin membresía activa (o RUT nuevo): mismo camino que la clase de
    // prueba gratis de invitado, con el mismo bloqueo si el RUT ya
    // pertenece a una cuenta real sin membresía (debe iniciar sesión).
    const emailLimpio = String(email || "").toLowerCase().trim();
    if (!nombre?.trim() || !apellido?.trim() || !telefono?.trim() || !emailLimpio) {
      return res.status(400).json({
        code: "SIN_MEMBRESIA",
        message:
          "No encontramos una membresía activa con ese RUT. Completa tus datos para agendar tu clase de prueba gratis.",
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpio)) {
      return res.status(400).json({ message: "El correo ingresado no es válido" });
    }

    const { cliente, error: identidadError } = await resolverClienteInvitadoPorRut({
      empresaId: empresa._id,
      rut,
      nombre,
      apellido,
      email: emailLimpio,
      telefono,
    });
    if (identidadError) {
      return res.status(identidadError.status).json(identidadError.body);
    }

    const resultado = await procesarInscripcion({
      empresaId: empresa._id,
      clase: sesion.clase,
      clienteId: cliente._id,
      fechaSesion: sesion.fechaSesion,
      cupoEfectivo: sesion.cupoEfectivo,
      tipoAcceso: "prueba_gratis",
    });
    if (resultado.error) {
      return res.status(resultado.error.status).json({ message: resultado.error.message });
    }

    return res.status(201).json({
      message: "¡Tu clase de prueba quedó agendada!",
      inscripcion: resultado.inscripcion,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Ya existe una inscripción con esos datos" });
    }
    console.error("Error al inscribir (flujo público):", error);
    return res
      .status(500)
      .json({ message: "Error interno al procesar tu inscripción" });
  }
};

export const cancelarInscripcion = async (req, res) => {
  try {
    const { inscripcionId } = req.params;
    const { motivo } = req.body;
    const empresaId = req.usuario.empresaId;
    const esAdmin = !!req.usuario.esAdmin;

    const inscripcion = await InscripcionClaseModel.findOne({
      _id: inscripcionId,
      empresa: empresaId,
    });
    if (!inscripcion) {
      return res.status(404).json({ message: "Inscripción no encontrada" });
    }

    if (!esAdmin && inscripcion.cliente.toString() !== req.usuario.id) {
      return res
        .status(403)
        .json({ message: "No puedes cancelar la inscripción de otro cliente" });
    }

    if (inscripcion.estado === "cancelada") {
      return res.status(400).json({ message: "Esta inscripción ya estaba cancelada" });
    }

    // Estaba "confirmada" (ocupaba un cupo real) — al cancelarla liberamos
    // ese cupo en el contador atómico para que quede disponible de nuevo.
    const liberaCupo = inscripcion.estado === "confirmada";

    inscripcion.estado = "cancelada";
    inscripcion.canceladaEn = new Date();
    inscripcion.motivoCancelacion = motivo || "";
    await inscripcion.save();

    if (liberaCupo) {
      await liberarCupoAtomico(inscripcion.clase, inscripcion.fecha);
    }

    return res.json({ message: "Inscripción cancelada correctamente", inscripcion });
  } catch (error) {
    console.error("Error al cancelar inscripción:", error);
    return res
      .status(500)
      .json({ message: "Error interno al cancelar la inscripción" });
  }
};

export const marcarPagoInscripcion = async (req, res) => {
  try {
    const { inscripcionId } = req.params;
    const { estado, monto, metodo } = req.body;
    const empresaId = req.usuario.empresaId;

    const inscripcion = await InscripcionClaseModel.findOne({
      _id: inscripcionId,
      empresa: empresaId,
    });
    if (!inscripcion) {
      return res.status(404).json({ message: "Inscripción no encontrada" });
    }

    if (estado) inscripcion.pago.estado = estado;
    if (monto !== undefined) inscripcion.pago.monto = monto;
    if (metodo !== undefined) inscripcion.pago.metodo = metodo;

    await inscripcion.save();

    return res.json({ message: "Pago actualizado correctamente", inscripcion });
  } catch (error) {
    console.error("Error al actualizar pago de inscripción:", error);
    return res
      .status(500)
      .json({ message: "Error interno al actualizar el pago" });
  }
};

/* =======================================================
   🟢 Mis inscripciones (vista del cliente logueado: sus propias clases,
   futuras e historial) — equivalente a "Mis reservas" en barbería
======================================================= */
export const misInscripciones = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const clienteId = req.usuario.id;

    const inscripciones = await InscripcionClaseModel.find({
      empresa: empresaId,
      cliente: clienteId,
    })
      .populate({
        path: "clase",
        select: "nombre descripcion instructor duracion color",
        populate: { path: "instructor", select: "nombre apellido" },
      })
      .sort({ fecha: -1 });

    return res.json({ inscripciones });
  } catch (error) {
    console.error("Error al obtener mis inscripciones:", error);
    return res
      .status(500)
      .json({ message: "Error interno al obtener tus inscripciones" });
  }
};

export const listarInscritosPorSesion = async (req, res) => {
  try {
    const { id } = req.params; // claseId
    const { fecha } = req.query;
    const empresaId = req.usuario.empresaId;

    if (!fecha) {
      return res.status(400).json({ message: "Debes indicar la fecha de la sesión" });
    }

    const clase = await ClaseModel.findOne({ _id: id, empresa: empresaId });
    if (!clase) {
      return res.status(404).json({ message: "Clase no encontrada" });
    }

    const fechaSesion = new Date(fecha);
    if (Number.isNaN(fechaSesion.getTime())) {
      return res.status(400).json({ message: "Fecha de sesión inválida" });
    }

    const inscritos = await InscripcionClaseModel.find({
      clase: id,
      fecha: fechaSesion,
      estado: { $ne: "cancelada" },
    })
      .populate("cliente", "nombre apellido email telefono")
      .sort({ createdAt: 1 });

    return res.json({ inscritos });
  } catch (error) {
    console.error("Error al listar inscritos:", error);
    return res.status(500).json({ message: "Error interno al listar los inscritos" });
  }
};
