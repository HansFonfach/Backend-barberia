import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import mongoose from "mongoose";

import InscripcionClaseModel from "../models/inscripcionClase.model.js";
import MedicionCorporalModel from "../models/medicionCorporal.model.js";
import UsuarioModel from "../models/usuario.model.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "America/Santiago";

// Empresas con modulos.clasesGrupales y/o modulos.entrenamientoPersonal:
// progreso personal del cliente (racha, resumen mensual, hitos) + bitácora
// de peso/medidas.
//
// Todo lo de "progreso" se calcula desde datos que YA existen (las mismas
// InscripcionClase que usa estadisticasGimnasioController.js para el panel
// del admin, con el mismo criterio: estado "confirmada" y fecha ya pasada
// cuenta como asistencia real — no hay check-in aparte). Nada se inventa
// ni se estima: si el cliente no ha ido a clases, no hay racha ni hitos.
//
// La bitácora de peso/medidas sigue siendo 100% descriptiva: nunca se
// calcula IMC ni se etiqueta un número como "bueno/malo". La única
// excepción, acotada, es getComparativaBitacora: si el cliente definió un
// objetivo (perfilEntrenamiento.objetivo, opt-in, ver
// entrenamientoPersonalController.js) puede sumar una sugerencia hedged
// tipo "considera más cardio" — nunca una interpretación del número en sí.

const ok = (res, data) => res.json({ ok: true, data });
const err = (res, msg, status = 500) =>
  res.status(status).json({ ok: false, message: msg });

const toId = (valor) => new mongoose.Types.ObjectId(String(valor));

/** Igual convención que estadisticasGimnasioController.js */
const variacion = (actual, anterior) =>
  anterior > 0 ? Math.round(((actual - anterior) / anterior) * 100) : null;

// Hitos por cantidad de clases asistidas en toda la historia del cliente.
const HITOS_ASISTENCIAS = [10, 25, 50, 100, 200, 365, 500];

/* =======================================================
   🟢 Mi progreso: racha de constancia + resumen mensual + hitos.
   GET /progreso-cliente/mi-progreso
   (el cliente solo puede ver el suyo; no recibe clienteId por query)
======================================================= */
export const getMiProgreso = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const clienteId = req.usuario.id;
    const ahora = new Date();

    const asistencias = await InscripcionClaseModel.find({
      empresa: toId(empresaId),
      cliente: toId(clienteId),
      estado: "confirmada",
      fecha: { $lte: ahora },
    })
      .select("fecha")
      .sort({ fecha: 1 })
      .lean();

    const totalHistorico = asistencias.length;

    // ── Resumen mensual (mes calendario actual vs. el anterior) ──
    const inicioMes = dayjs(ahora).tz(TZ).startOf("month");
    const inicioMesAnterior = inicioMes.subtract(1, "month");

    let esteMes = 0;
    let mesAnterior = 0;
    for (const a of asistencias) {
      const f = dayjs(a.fecha).tz(TZ);
      if (!f.isBefore(inicioMes)) {
        esteMes += 1;
      } else if (!f.isBefore(inicioMesAnterior)) {
        mesAnterior += 1;
      }
    }

    // ── Racha: semanas consecutivas (terminando en la semana actual)
    // con al menos 1 asistencia ──
    const semanasConAsistencia = new Set(
      asistencias.map((a) => dayjs(a.fecha).tz(TZ).startOf("week").format("YYYY-MM-DD")),
    );
    let rachaSemanas = 0;
    let cursor = dayjs(ahora).tz(TZ).startOf("week");
    while (semanasConAsistencia.has(cursor.format("YYYY-MM-DD"))) {
      rachaSemanas += 1;
      cursor = cursor.subtract(1, "week");
    }

    // ── Hitos por total histórico de asistencias ──
    const hitos = HITOS_ASISTENCIAS.map((valor) => ({
      valor,
      alcanzado: totalHistorico >= valor,
    }));
    const proximoHito = HITOS_ASISTENCIAS.find((h) => h > totalHistorico) || null;

    return ok(res, {
      totalHistorico,
      esteMes,
      mesAnterior,
      variacionMes: variacion(esteMes, mesAnterior),
      rachaSemanas,
      hitos,
      proximoHito,
      faltanParaProximoHito: proximoHito ? proximoHito - totalHistorico : null,
    });
  } catch (error) {
    console.error("Error al obtener el progreso del cliente:", error);
    return err(res, "Error interno al obtener tu progreso");
  }
};

/* =======================================================
   🟢 Crear un registro de peso/medidas.
   POST /progreso-cliente/medicion-corporal
   - Un cliente solo puede crear el suyo.
   - Un admin puede crear uno para cualquier cliente de su empresa
     pasando clienteId en el body (ej. control presencial).
======================================================= */
export const crearMedicionCorporal = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const esAdmin = !!req.usuario.esAdmin;
    const {
      clienteId,
      fecha,
      pesoKg,
      alturaCm,
      grasaCorporalPorcentaje,
      medidas,
      notas,
    } = req.body;

    const clienteObjetivo = esAdmin && clienteId ? clienteId : req.usuario.id;

    const tieneAlgunDato =
      pesoKg != null ||
      alturaCm != null ||
      grasaCorporalPorcentaje != null ||
      (medidas && Object.values(medidas).some((v) => v != null));

    if (!tieneAlgunDato) {
      return err(res, "Ingresa al menos un dato (peso, medidas, etc.)", 400);
    }

    const registro = await MedicionCorporalModel.create({
      empresa: empresaId,
      cliente: clienteObjetivo,
      fecha: fecha ? new Date(fecha) : new Date(),
      pesoKg: pesoKg ?? null,
      alturaCm: alturaCm ?? null,
      grasaCorporalPorcentaje: grasaCorporalPorcentaje ?? null,
      medidas: {
        cinturaCm: medidas?.cinturaCm ?? null,
        caderaCm: medidas?.caderaCm ?? null,
        pechoCm: medidas?.pechoCm ?? null,
        brazoCm: medidas?.brazoCm ?? null,
        piernaCm: medidas?.piernaCm ?? null,
      },
      notas: notas || "",
      registradoPor: req.usuario.id,
      registradoPorRol: esAdmin ? "admin" : "cliente",
    });

    return res.status(201).json({ ok: true, data: registro });
  } catch (error) {
    console.error("Error al crear medición corporal:", error);
    return err(res, "Error interno al guardar el registro");
  }
};

/* =======================================================
   🟣 Mi bitácora (historial propio, orden cronológico).
   GET /progreso-cliente/medicion-corporal/mias
======================================================= */
export const listarMisMedicionesCorporales = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const mediciones = await MedicionCorporalModel.find({
      empresa: empresaId,
      cliente: req.usuario.id,
    }).sort({ fecha: 1 });

    return ok(res, { mediciones });
  } catch (error) {
    console.error("Error al listar mediciones corporales:", error);
    return err(res, "Error interno al obtener tu bitácora");
  }
};

/* =======================================================
   🟣 Bitácora de un cliente puntual (solo admin — ej. para verla
   desde la ficha del cliente).
   GET /progreso-cliente/medicion-corporal/cliente/:clienteId
======================================================= */
export const listarMedicionesClienteCorporal = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const { clienteId } = req.params;

    const mediciones = await MedicionCorporalModel.find({
      empresa: empresaId,
      cliente: clienteId,
    }).sort({ fecha: 1 });

    return ok(res, { mediciones });
  } catch (error) {
    console.error("Error al listar mediciones corporales del cliente:", error);
    return err(res, "Error interno al obtener la bitácora del cliente");
  }
};

/* =======================================================
   🔴 Eliminar un registro.
   DELETE /progreso-cliente/medicion-corporal/:id
   - El admin puede borrar cualquier registro de su empresa.
   - El cliente solo puede borrar un registro que él mismo ingresó
     (no uno que haya quedado de un control hecho por el admin).
======================================================= */
export const eliminarMedicionCorporal = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const esAdmin = !!req.usuario.esAdmin;
    const { id } = req.params;

    const registro = await MedicionCorporalModel.findOne({
      _id: id,
      empresa: empresaId,
    });
    if (!registro) {
      return err(res, "No se encontró el registro", 404);
    }

    const puedeBorrar =
      esAdmin ||
      (String(registro.cliente) === String(req.usuario.id) &&
        String(registro.registradoPor) === String(req.usuario.id));

    if (!puedeBorrar) {
      return err(res, "No tienes permiso para eliminar este registro", 403);
    }

    await registro.deleteOne();
    return ok(res, { eliminado: true });
  } catch (error) {
    console.error("Error al eliminar medición corporal:", error);
    return err(res, "Error interno al eliminar el registro");
  }
};

/* =======================================================
   🔵 Comparativa mensual de bitácora: último registro vs. el registro
   anterior más cercano a ~1 mes atrás (no exige que caigan en meses
   calendario distintos, porque la gente no siempre anota el mismo día del
   mes — busca el más reciente que tenga al menos DIAS_MIN_ENTRE_COMPARACION
   días de diferencia con el último).
   GET /progreso-cliente/comparativa-bitacora

   Los deltas son 100% aritmética (actual - anterior), nunca una
   interpretación. La única pieza "inteligente" es una sugerencia opcional,
   hedged, que solo aparece si el cliente definió su objetivo — y ni así se
   etiqueta el número (nunca dice "estás mal", solo "considera X").
======================================================= */
const DIAS_MIN_ENTRE_COMPARACION = 20;

const SUGERENCIA_POR_OBJETIVO = {
  bajar_grasa: (deltaPeso) =>
    deltaPeso != null && deltaPeso >= 0
      ? "Tu objetivo es bajar grasa y el peso no bajó en este período — quizás valga sumar más cardio o revisar la alimentación. Es solo una idea, no una regla: el peso también se mueve por retención de líquido, ciclo, masa muscular ganada, etc."
      : null,
  subir_masa: (deltaPeso) =>
    deltaPeso != null && deltaPeso <= 0
      ? "Tu objetivo es subir masa y el peso no subió en este período — quizás falten más calorías o volumen de entrenamiento. Es solo una idea, no una regla."
      : null,
};

export const getComparativaBitacora = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const clienteId = req.usuario.id;

    const mediciones = await MedicionCorporalModel.find({
      empresa: empresaId,
      cliente: clienteId,
    })
      .sort({ fecha: 1 })
      .lean();

    if (mediciones.length === 0) {
      return ok(res, { disponible: false, motivo: "sin_registros" });
    }

    const actual = mediciones[mediciones.length - 1];
    const fechaActual = dayjs(actual.fecha).tz(TZ);

    let anterior = null;
    for (let i = mediciones.length - 2; i >= 0; i--) {
      const f = dayjs(mediciones[i].fecha).tz(TZ);
      if (fechaActual.diff(f, "day") >= DIAS_MIN_ENTRE_COMPARACION) {
        anterior = mediciones[i];
        break;
      }
    }

    const resumen = (m) => ({
      fecha: m.fecha,
      pesoKg: m.pesoKg,
      grasaCorporalPorcentaje: m.grasaCorporalPorcentaje,
      medidas: m.medidas,
    });

    if (!anterior) {
      return ok(res, {
        disponible: false,
        motivo: "un_solo_periodo",
        ultimo: resumen(actual),
      });
    }

    const delta = (a, b) => (a != null && b != null ? Math.round((a - b) * 10) / 10 : null);
    const deltas = {
      pesoKg: delta(actual.pesoKg, anterior.pesoKg),
      grasaCorporalPorcentaje: delta(actual.grasaCorporalPorcentaje, anterior.grasaCorporalPorcentaje),
      cinturaCm: delta(actual.medidas?.cinturaCm, anterior.medidas?.cinturaCm),
      caderaCm: delta(actual.medidas?.caderaCm, anterior.medidas?.caderaCm),
      pechoCm: delta(actual.medidas?.pechoCm, anterior.medidas?.pechoCm),
      brazoCm: delta(actual.medidas?.brazoCm, anterior.medidas?.brazoCm),
      piernaCm: delta(actual.medidas?.piernaCm, anterior.medidas?.piernaCm),
    };

    const usuario = await UsuarioModel.findById(clienteId).select("perfilEntrenamiento").lean();
    const objetivo = usuario?.perfilEntrenamiento?.objetivo || null;
    const generarSugerencia = objetivo && SUGERENCIA_POR_OBJETIVO[objetivo];
    const sugerencia = generarSugerencia ? generarSugerencia(deltas.pesoKg) : null;

    return ok(res, {
      disponible: true,
      objetivo,
      actual: resumen(actual),
      anterior: resumen(anterior),
      deltas,
      sugerencia,
    });
  } catch (error) {
    console.error("Error al calcular comparativa de bitácora:", error);
    return err(res, "Error interno al calcular tu comparativa");
  }
};
