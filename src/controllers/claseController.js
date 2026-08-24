import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

import ClaseModel from "../models/clase.model.js";
import ExcepcionClaseModel from "../models/excepcionClase.model.js";
import InscripcionClaseModel from "../models/inscripcionClase.model.js";
import MembresiaClaseModel from "../models/membresiaClase.model.js";
import UsuarioModel from "../models/usuario.model.js";
import EmpresaModel from "../models/empresa.model.js";
import { contarClasesUsadasMembresia } from "../helpers/contarClasesUsadasMembresia.js";
import { esRutValido, formatearRut, limpiarRut } from "../helpers/validarRut.js";

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

    if (!["cancelada", "cupo_modificado"].includes(tipo)) {
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

  const [excepciones, inscripciones] = await Promise.all([
    ExcepcionClaseModel.find({
      clase: { $in: claseIds },
      fecha: { $gte: inicio.toDate(), $lte: fin.toDate() },
    }).lean(),
    InscripcionClaseModel.find({
      clase: { $in: claseIds },
      fecha: { $gte: inicio.toDate(), $lte: fin.toDate() },
      estado: "confirmada",
    }).lean(),
  ]);

  const excepcionPorClaseFecha = new Map();
  for (const ex of excepciones) {
    const key = `${ex.clase}_${dayjs(ex.fecha).tz(TZ).format("YYYY-MM-DD")}`;
    excepcionPorClaseFecha.set(key, ex);
  }

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
======================================================= */

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

    const clase = await ClaseModel.findOne({
      _id: id,
      empresa: empresaId,
      activa: true,
    });
    if (!clase) {
      return res.status(404).json({ message: "Clase no encontrada" });
    }

    const fechaSesion = new Date(fecha);
    if (Number.isNaN(fechaSesion.getTime())) {
      return res.status(400).json({ message: "Fecha de sesión inválida" });
    }

    const diaSemana = dayjs(fechaSesion).tz(TZ).day();
    const horaSesion = dayjs(fechaSesion).tz(TZ).format("HH:mm");
    const existeBloque = clase.horarioSemanal.some(
      (h) => h.diaSemana === diaSemana && h.horaInicio === horaSesion,
    );
    if (!existeBloque) {
      return res.status(400).json({
        message: "Esa fecha/hora no corresponde a una sesión válida de esta clase",
      });
    }

    const inicioDia = dayjs(fechaSesion).tz(TZ).startOf("day").toDate();
    const finDia = dayjs(fechaSesion).tz(TZ).endOf("day").toDate();
    const excepcion = await ExcepcionClaseModel.findOne({
      clase: clase._id,
      fecha: { $gte: inicioDia, $lte: finDia },
    });

    if (excepcion?.tipo === "cancelada") {
      return res.status(409).json({ message: "Esta sesión fue cancelada" });
    }

    const cupoEfectivo =
      excepcion?.tipo === "cupo_modificado" && excepcion.cupoOverride != null
        ? excepcion.cupoOverride
        : clase.cupoMaximo;

    const cliente = await UsuarioModel.findOne({
      _id: clienteObjetivoId,
      empresa: empresaId,
    });
    if (!cliente) {
      return res.status(404).json({ message: "Cliente no encontrado en esta empresa" });
    }

    let pago = { estado: "no_aplica", monto: 0, metodo: null };

    if (tipoAcceso === "membresia") {
      const membresia = await MembresiaClaseModel.findOne({
        empresa: empresaId,
        cliente: clienteObjetivoId,
        activa: true,
        fechaInicio: { $lte: fechaSesion },
        fechaFin: { $gte: fechaSesion },
      });
      if (!membresia) {
        return res.status(400).json({
          message: "El cliente no tiene una mensualidad activa para esa fecha",
        });
      }

      // La mensualidad NO es ilimitada: tiene un cupo fijo de clases al mes
      const clasesUsadas = await contarClasesUsadasMembresia(membresia);
      if (clasesUsadas >= membresia.clasesIncluidas) {
        return res.status(409).json({
          message:
            "El cliente ya usó todas las clases incluidas en su plan este mes",
        });
      }
    } else if (tipoAcceso === "prueba_gratis") {
      const yaUsoPrueba = await InscripcionClaseModel.findOne({
        empresa: empresaId,
        cliente: clienteObjetivoId,
        tipoAcceso: "prueba_gratis",
        estado: { $ne: "cancelada" },
      });
      if (yaUsoPrueba) {
        return res
          .status(409)
          .json({ message: "El cliente ya usó su día de prueba gratis" });
      }
    } else if (tipoAcceso === "pase_dia") {
      // Si no mandan un monto puntual, se usa el precio de pase diario
      // configurado en la clase (si el admin lo definió)
      const montoFinal =
        monto !== undefined && monto !== null ? monto : clase.precioPaseDiario || 0;
      pago = {
        estado: "pendiente",
        monto: montoFinal,
        metodo: metodo || null,
      };
    } else {
      return res.status(400).json({ message: "Tipo de acceso inválido" });
    }

    const inscritosActuales = await InscripcionClaseModel.countDocuments({
      clase: clase._id,
      fecha: fechaSesion,
      estado: "confirmada",
    });

    if (inscritosActuales >= cupoEfectivo) {
      return res
        .status(409)
        .json({ message: "No hay cupos disponibles para esta sesión" });
    }

    const inscripcionExistente = await InscripcionClaseModel.findOne({
      clase: clase._id,
      fecha: fechaSesion,
      cliente: clienteObjetivoId,
      estado: { $ne: "cancelada" },
    });
    if (inscripcionExistente) {
      return res
        .status(409)
        .json({ message: "El cliente ya está inscrito en esta sesión" });
    }

    const inscripcion = await InscripcionClaseModel.create({
      empresa: empresaId,
      clase: clase._id,
      cliente: clienteObjetivoId,
      fecha: fechaSesion,
      estado: "confirmada",
      tipoAcceso,
      pago,
    });

    return res
      .status(201)
      .json({ message: "Inscripción registrada correctamente", inscripcion });
  } catch (error) {
    if (error?.code === 11000) {
      return res
        .status(409)
        .json({ message: "El cliente ya está inscrito en esta sesión" });
    }
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
     ese usuario invitado (igual que ya hace la barbería) y se valida todo
     lo mismo que en inscribirCliente (sesión válida, cupo, no repetir la
     prueba gratis, no inscribirse 2 veces a la misma sesión).

   No se reutiliza el código de inscribirCliente para no arriesgar ese flujo
   ya probado; se duplica la validación de sesión/cupo a propósito.
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

    const clase = await ClaseModel.findOne({
      _id: claseId,
      empresa: empresa._id,
      activa: true,
    });
    if (!clase) {
      return res.status(404).json({ message: "Clase no encontrada" });
    }

    const fechaSesion = new Date(fecha);
    if (Number.isNaN(fechaSesion.getTime())) {
      return res.status(400).json({ message: "Fecha de sesión inválida" });
    }

    const diaSemana = dayjs(fechaSesion).tz(TZ).day();
    const horaSesion = dayjs(fechaSesion).tz(TZ).format("HH:mm");
    const existeBloque = clase.horarioSemanal.some(
      (h) => h.diaSemana === diaSemana && h.horaInicio === horaSesion,
    );
    if (!existeBloque) {
      return res.status(400).json({
        message: "Esa fecha/hora no corresponde a una sesión válida de esta clase",
      });
    }

    const inicioDia = dayjs(fechaSesion).tz(TZ).startOf("day").toDate();
    const finDia = dayjs(fechaSesion).tz(TZ).endOf("day").toDate();
    const excepcion = await ExcepcionClaseModel.findOne({
      clase: clase._id,
      fecha: { $gte: inicioDia, $lte: finDia },
    });
    if (excepcion?.tipo === "cancelada") {
      return res.status(409).json({ message: "Esta sesión fue cancelada" });
    }
    const cupoEfectivo =
      excepcion?.tipo === "cupo_modificado" && excepcion.cupoOverride != null
        ? excepcion.cupoOverride
        : clase.cupoMaximo;

    // 🔍 ¿El RUT ya existe en esta empresa? (mismo fallback que
    // getUsuarioByRutPublico, por si quedó guardado con puntos/guión distinto)
    let cliente = await UsuarioModel.findOne({ empresa: empresa._id, rut });
    if (!cliente) {
      const rutLimpioBuscado = limpiarRut(rut);
      const usuariosEmpresa = await UsuarioModel.find({ empresa: empresa._id });
      cliente = usuariosEmpresa.find(
        (u) => u.rut && limpiarRut(u.rut) === rutLimpioBuscado,
      );
    }

    if (cliente && cliente.rol !== "invitado") {
      // 🔒 Ya tiene una cuenta real: no seguimos sin que inicie sesión.
      return res.status(409).json({
        code: "CUENTA_EXISTENTE",
        message:
          "Ya tienes una cuenta con nosotros. Inicia sesión para agendar tu clase.",
      });
    }

    if (!cliente) {
      cliente = await UsuarioModel.create({
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        rut,
        email,
        telefono: telefono.trim(),
        rol: "invitado",
        empresa: empresa._id,
      });
    } else {
      // Invitado que ya había agendado antes: solo actualizamos su contacto
      cliente.nombre = nombre.trim();
      cliente.apellido = apellido.trim();
      cliente.email = email;
      cliente.telefono = telefono.trim();
      await cliente.save();
    }

    // La prueba gratis es una sola vez por persona, para siempre
    const yaUsoPrueba = await InscripcionClaseModel.findOne({
      empresa: empresa._id,
      cliente: cliente._id,
      tipoAcceso: "prueba_gratis",
      estado: { $ne: "cancelada" },
    });
    if (yaUsoPrueba) {
      return res
        .status(409)
        .json({ message: "Ya usaste tu clase de prueba gratis" });
    }

    const inscritosActuales = await InscripcionClaseModel.countDocuments({
      clase: clase._id,
      fecha: fechaSesion,
      estado: "confirmada",
    });
    if (inscritosActuales >= cupoEfectivo) {
      return res
        .status(409)
        .json({ message: "No hay cupos disponibles para esta sesión" });
    }

    const inscripcionExistente = await InscripcionClaseModel.findOne({
      clase: clase._id,
      fecha: fechaSesion,
      cliente: cliente._id,
      estado: { $ne: "cancelada" },
    });
    if (inscripcionExistente) {
      return res.status(409).json({ message: "Ya estás inscrito en esta sesión" });
    }

    const inscripcion = await InscripcionClaseModel.create({
      empresa: empresa._id,
      clase: clase._id,
      cliente: cliente._id,
      fecha: fechaSesion,
      estado: "confirmada",
      tipoAcceso: "prueba_gratis",
      pago: { estado: "no_aplica", monto: 0, metodo: null },
    });

    return res
      .status(201)
      .json({ message: "¡Tu clase de prueba quedó agendada!", inscripcion });
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

    inscripcion.estado = "cancelada";
    inscripcion.canceladaEn = new Date();
    inscripcion.motivoCancelacion = motivo || "";
    await inscripcion.save();

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
