// controllers/feriados.controller.js
import Feriado from "../models/feriados.js";
import feriadoEmpresaModel from "../models/feriadoEmpresa.model.js";
import excepcionHorarioModel from "../models/excepcionHorario.model.js";
import usuarioModel from "../models/usuario.model.js";
import Reserva from "../models/reserva.model.js";
import axios from "axios";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const ZONA = "America/Santiago";

/** Rango del día (en Chile) para una fecha guardada como Date, en UTC —
 * mismo criterio de conversión que usa el resto del sistema. */
const rangoDiaChile = (fechaDate) => {
  const fechaStr = dayjs(fechaDate).tz(ZONA).format("YYYY-MM-DD");
  const inicio = dayjs.tz(fechaStr, "YYYY-MM-DD", ZONA).startOf("day").utc().toDate();
  const fin = dayjs.tz(fechaStr, "YYYY-MM-DD", ZONA).endOf("day").utc().toDate();
  return { inicio, fin };
};

/** Obtener todos */
export const getFeriados = async (req, res) => {
  try {
    const feriados = await Feriado.find().sort({ fecha: 1 });
    res.json(feriados);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener feriados" });
  }
};

/** Activar o desactivar un feriado */
export const toggleFeriado = async (req, res) => {
  try {
    const { id } = req.params;
    const feriado = await Feriado.findById(id);

    if (!feriado) return res.status(404).json({ message: "No encontrado" });

    feriado.activo = !feriado.activo;
    await feriado.save();

    res.json(feriado);
  } catch (error) {
    res.status(500).json({ message: "Error al actualizar feriado" });
  }
};

/** Cambiar comportamiento de feriado */
export const cambiarComportamientoFeriado = async (req, res) => {
  try {
    const { id } = req.params;
    const { comportamiento } = req.body;

    // Validar que sea barbero
    if (req.usuario?.rol !== "barbero") {
      return res.status(403).json({ message: "No autorizado" });
    }

    const feriado = await Feriado.findById(id);
    if (!feriado) {
      return res.status(404).json({ message: "Feriado no encontrado" });
    }

    // Validar comportamiento
    if (!["bloquear_todo", "permitir_excepciones"].includes(comportamiento)) {
      return res.status(400).json({ message: "Comportamiento inválido" });
    }

    feriado.comportamiento = comportamiento;
    await feriado.save();

    res.json({
      message: `Feriado "${feriado.nombre}" ahora ${comportamiento === "bloquear_todo" ? "bloquea completamente" : "permite excepciones"}`,
      feriado
    });
  } catch (error) {
    console.error("❌ Error al cambiar comportamiento:", error);
    res.status(500).json({ message: "Error al actualizar feriado" });
  }
};

/** Verificar feriado por fecha */
export const verificarFeriado = async (req, res) => {
  try {
    const { fecha } = req.query;
    if (!fecha) return res.status(400).json({ message: "Fecha requerida" });

    const inicioDia = dayjs.tz(fecha, "YYYY-MM-DD", "America/Santiago").startOf("day").toDate();
    const finDia = dayjs.tz(fecha, "YYYY-MM-DD", "America/Santiago").endOf("day").toDate();

    const feriado = await Feriado.findOne({
      fecha: { $gte: inicioDia, $lt: finDia },
      activo: true
    });

    res.json({
      esFeriado: !!feriado,
      nombre: feriado?.nombre || null,
      comportamiento: feriado?.comportamiento || "bloquear_todo",
      activo: feriado?.activo || false,
      fecha: fecha
    });
  } catch (error) {
    res.status(500).json({ message: "Error al verificar feriado" });
  }
};

/** Cargar feriados desde API Nager.Date */
export const cargarFeriadosChile = async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const { data } = await axios.get(`https://date.nager.at/api/v3/PublicHolidays/${year}/CL`);

    let cargados = 0;

    for (const f of data) {
      const fecha = new Date(`${f.date}T12:00:00.000Z`);
      const nombre = f.localName;

      const existe = await Feriado.findOne({ fecha });
      if (existe) {
        // Actualizar si ya existe
        existe.nombre = nombre;
        await existe.save();
        continue;
      }

      await Feriado.create({
        fecha,
        nombre,
        activo: true,
      
      });

      cargados++;
    }

    res.json({
      message: `Feriados cargados/actualizados: ${cargados}`,
      total: cargados
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al cargar feriados" });
  }
};

/* =====================================================
   FERIADOS DE LA EMPRESA (nuevo modelo, scopeado por tenant)

   El catálogo de feriados sigue siendo compartido (fecha/nombre), pero
   "¿esta empresa lo trabaja?" vive en FeriadoEmpresa, una decisión por
   empresa. Reemplaza al viejo campo `comportamiento` del catálogo
   compartido para todo lo nuevo — ese campo se deja intacto para no
   romper nada, pero ya no decide nada en el motor de disponibilidad.
===================================================== */

/** Lista los próximos feriados con el estado de ESTA empresa: si los
 * habilitó o no, y cuántos de sus profesionales ya quedaron configurados
 * para trabajar cada uno (para el resumen "Abierto — 2 profesionales"). */
export const getFeriadosEmpresa = async (req, res) => {
  try {
    const empresaId = req.usuario?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ message: "Empresa no identificada" });
    }

    const hoyUTC = dayjs().tz(ZONA).startOf("day").utc().toDate();

    const [feriadosProximos, decisiones, barberosEmpresa] = await Promise.all([
      Feriado.find({ activo: true, fecha: { $gte: hoyUTC } })
        .sort({ fecha: 1 })
        .lean(),
      feriadoEmpresaModel.find({ empresa: empresaId }).lean(),
      usuarioModel.find({ empresa: empresaId, rol: "barbero" }).select("_id").lean(),
    ]);

    const decisionPorFeriado = new Map(
      decisiones.map((d) => [String(d.feriado), d]),
    );
    const barberoIds = barberosEmpresa.map((b) => b._id);

    const resultado = await Promise.all(
      feriadosProximos.map(async (f) => {
        const decision = decisionPorFeriado.get(String(f._id));
        const habilitado = decision?.habilitado === true;

        let profesionalesConfigurados = 0;
        if (habilitado && barberoIds.length) {
          const { inicio, fin } = rangoDiaChile(f.fecha);
          profesionalesConfigurados = await excepcionHorarioModel.countDocuments({
            barbero: { $in: barberoIds },
            tipo: "trabajo_feriado",
            fecha: { $gte: inicio, $lte: fin },
          });
        }

        return {
          id: f._id,
          nombre: f.nombre,
          fecha: dayjs(f.fecha).tz(ZONA).format("YYYY-MM-DD"),
          habilitado,
          totalProfesionales: barberoIds.length,
          profesionalesConfigurados,
        };
      }),
    );

    return res.json({ feriados: resultado, total: resultado.length });
  } catch (error) {
    console.error("❌ Error en getFeriadosEmpresa:", error);
    res.status(500).json({ message: "Error al obtener los feriados de la empresa" });
  }
};

/** Detalle de UN feriado para el panel de equipo: cada profesional de la
 * empresa junto con su configuración actual (si la tiene) — para poder
 * prellenar el formulario al expandir un feriado ya habilitado, sin
 * adivinar nada en el frontend. Solo lectura, no toca el motor de
 * disponibilidad ni crea/modifica nada. */
export const getDetalleFeriadoEmpresa = async (req, res) => {
  try {
    const empresaId = req.usuario?.empresaId;
    const { feriadoId } = req.params;

    if (!req.usuario?.esAdmin) {
      return res.status(403).json({
        message: "Solo un administrador puede ver el detalle del feriado",
      });
    }
    if (!empresaId || !feriadoId) {
      return res.status(400).json({ message: "feriadoId es requerido" });
    }

    const feriado = await Feriado.findById(feriadoId);
    if (!feriado) {
      return res.status(404).json({ message: "Feriado no encontrado" });
    }

    const { inicio, fin } = rangoDiaChile(feriado.fecha);

    const [barberos, excepciones] = await Promise.all([
      usuarioModel
        .find({ empresa: empresaId, rol: "barbero" })
        .select("nombre apellido fotoPerfil")
        .lean(),
      excepcionHorarioModel
        .find({ tipo: "trabajo_feriado", fecha: { $gte: inicio, $lte: fin } })
        .lean(),
    ]);

    const barberoIds = new Set(barberos.map((b) => String(b._id)));
    const excepcionPorBarbero = new Map(
      excepciones
        .filter((e) => barberoIds.has(String(e.barbero)))
        .map((e) => [String(e.barbero), e]),
    );

    const profesionales = barberos.map((b) => {
      const exc = excepcionPorBarbero.get(String(b._id));
      return {
        barberoId: b._id,
        nombre: b.nombre,
        apellido: b.apellido,
        fotoPerfil: b.fotoPerfil || null,
        configurado: !!exc,
        horaInicio: exc?.horaInicio || null,
        horaFin: exc?.horaFin || null,
        serviciosPermitidos: (exc?.serviciosPermitidos || []).map(String),
        preciosEspeciales: (exc?.preciosEspeciales || []).map((p) => ({
          servicio: String(p.servicio),
          precio: p.precio,
        })),
      };
    });

    return res.json({
      feriado: {
        id: feriado._id,
        nombre: feriado.nombre,
        fecha: dayjs(feriado.fecha).tz(ZONA).format("YYYY-MM-DD"),
      },
      profesionales,
    });
  } catch (error) {
    console.error("❌ Error en getDetalleFeriadoEmpresa:", error);
    res.status(500).json({ message: "Error al obtener el detalle del feriado" });
  }
};

/** El interruptor grande: ¿la empresa atiende este feriado o no? Solo un
 * admin puede decidirlo. Si se está cerrando y ya hay reservas agendadas
 * ese día, se rechaza — hay que resolverlas primero, no desaparecen
 * solas ni quedan en un estado inconsistente. */
export const toggleFeriadoEmpresa = async (req, res) => {
  try {
    const empresaId = req.usuario?.empresaId;
    const { feriadoId, habilitado } = req.body;

    if (!req.usuario?.esAdmin) {
      return res.status(403).json({
        message: "Solo un administrador puede decidir si la empresa atiende un feriado",
      });
    }

    if (!empresaId || !feriadoId || typeof habilitado !== "boolean") {
      return res.status(400).json({
        message: "feriadoId y habilitado (true/false) son requeridos",
      });
    }

    const feriado = await Feriado.findById(feriadoId);
    if (!feriado) {
      return res.status(404).json({ message: "Feriado no encontrado" });
    }

    if (!habilitado) {
      const { inicio, fin } = rangoDiaChile(feriado.fecha);
      const barberosEmpresa = await usuarioModel
        .find({ empresa: empresaId, rol: "barbero" })
        .select("_id")
        .lean();
      const barberoIds = barberosEmpresa.map((b) => b._id);

      const reservasDelDia = barberoIds.length
        ? await Reserva.countDocuments({
            barbero: { $in: barberoIds },
            fecha: { $gte: inicio, $lte: fin },
            estado: { $in: ["pendiente", "confirmada"] },
          })
        : 0;

      if (reservasDelDia > 0) {
        return res.status(409).json({
          message: `Hay ${reservasDelDia} reserva(s) agendadas ese día. Reagéndalas o cancélalas antes de cerrar el feriado.`,
        });
      }
    }

    const feriadoEmpresa = await feriadoEmpresaModel.findOneAndUpdate(
      { empresa: empresaId, feriado: feriadoId },
      {
        empresa: empresaId,
        feriado: feriadoId,
        fecha: feriado.fecha,
        habilitado,
        creadoPor: req.usuario.id,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    return res.json({
      message: habilitado
        ? `Tu empresa atenderá el feriado "${feriado.nombre}"`
        : `Tu empresa no atenderá el feriado "${feriado.nombre}"`,
      feriadoEmpresa,
    });
  } catch (error) {
    console.error("❌ Error en toggleFeriadoEmpresa:", error);
    res.status(500).json({ message: "Error al actualizar el feriado de la empresa" });
  }
};