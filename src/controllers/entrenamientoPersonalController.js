import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

import RegistroEntrenamientoModel from "../models/registroEntrenamiento.model.js";
import EjercicioCatalogoModel from "../models/ejercicioCatalogo.model.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "America/Santiago";

// Módulo de uso personal (modulos.entrenamientoPersonal): registro libre de
// entrenamiento (gimnasio o deporte, sin horario ni cupo) + sugerencia de
// qué entrenar hoy + racha/hitos, en el mismo espíritu que
// progresoClienteController.js pero sin depender del modelo de "clases" de
// gimnasios reales (ver comentario en registroEntrenamiento.model.js).

const ok = (res, data) => res.json({ ok: true, data });
const err = (res, msg, status = 500) =>
  res.status(status).json({ ok: false, message: msg });

// Grupos musculares que entran en la rotación de sugerencia. Cardio,
// fútbol y "otro" SÍ cuentan para la racha y el aviso de descanso, pero no
// compiten por turno en la rotación (no tendría sentido "sugerir fútbol"
// solo porque hace tiempo no se juega, es una actividad aparte).
const GRUPOS_MUSCULARES = ["pecho", "espalda", "piernas", "hombros", "brazos", "core"];
export const NOMBRES_GRUPO = {
  pecho: "Pecho",
  espalda: "Espalda",
  piernas: "Piernas",
  hombros: "Hombros",
  brazos: "Brazos",
  core: "Core",
  cardio: "Cardio",
  futbol: "Fútbol",
  otro: "Otro",
};

const HITOS_ENTRENAMIENTOS = [10, 25, 50, 100, 200, 365, 500];

// Si hay actividad registrada 5 días seguidos, se sugiere descansar en vez
// de seguir agregando un grupo más a la rotación.
const UMBRAL_DIAS_SEGUIDOS_PARA_DESCANSO = 5;
// Si pasan 4+ días sin ningún registro, se muestra el aviso de constancia.
const UMBRAL_DIAS_SIN_ACTIVIDAD_PARA_AVISO = 4;

// Sugerencia de subir peso: si un mismo ejercicio se registró con
// EXACTAMENTE el mismo peso las últimas N veces (y la más reciente no es
// muy antigua, si no ya no es relevante), se sugiere subir un poco. Es a
// propósito una sugerencia informal ("quizás sea buen momento"), no una
// receta — no sabemos si esa semana el usuario durmió mal, está en déficit
// calórico fuerte, etc. Ver nota más abajo sobre subir peso vs. bajar grasa.
const UMBRAL_SESIONES_MISMO_PESO = 3;
const INCREMENTO_SUGERIDO_KG = 2.5;
const VENTANA_RELEVANCIA_DIAS = 30;

const variacion = (actual, anterior) =>
  anterior > 0 ? Math.round(((actual - anterior) / anterior) * 100) : null;

/* =======================================================
   💪 Sugerencias de subir peso por ejercicio (ej: "llevas 3 veces con
   30kg en Prensa de piernas, sube a 32.5kg"). Se calcula sobre TODOS los
   registros del cliente (ya vienen ordenados ascendente por fecha), no
   sobre uno solo — así agrupa por nombre de ejercicio sin importar en qué
   sesión/día quedó cada uno.
======================================================= */
const calcularSugerenciasPeso = (registros, ahora) => {
  const porEjercicio = new Map(); // nombreNormalizado -> { nombre, entradas: [{pesoKg, fecha}] }

  for (const r of registros) {
    for (const e of r.ejercicios || []) {
      if (e.pesoKg == null) continue;
      const clave = e.nombre.trim().toLowerCase();
      if (!porEjercicio.has(clave)) {
        porEjercicio.set(clave, { nombre: e.nombre.trim(), entradas: [] });
      }
      const entrada = porEjercicio.get(clave);
      entrada.nombre = e.nombre.trim(); // se queda con el casing más reciente
      entrada.entradas.push({ pesoKg: e.pesoKg, fecha: r.fecha });
    }
  }

  const sugerencias = [];
  for (const { nombre, entradas } of porEjercicio.values()) {
    if (entradas.length < UMBRAL_SESIONES_MISMO_PESO) continue;

    const ultimas = entradas.slice(-UMBRAL_SESIONES_MISMO_PESO);
    const pesoActual = ultimas[ultimas.length - 1].pesoKg;
    const todasIguales = ultimas.every((x) => x.pesoKg === pesoActual);
    if (!todasIguales) continue;

    const ultimaFecha = dayjs(ultimas[ultimas.length - 1].fecha).tz(TZ);
    const diasDesdeUltima = ahora.startOf("day").diff(ultimaFecha.startOf("day"), "day");
    if (diasDesdeUltima > VENTANA_RELEVANCIA_DIAS) continue; // ya no es un ejercicio activo

    const pesoSugerido = Math.round((pesoActual + INCREMENTO_SUGERIDO_KG) * 100) / 100;
    sugerencias.push({
      nombre,
      pesoActual,
      vecesSeguidasConEsePeso: ultimas.length,
      pesoSugerido,
      mensaje: `Llevas ${ultimas.length} veces seguidas con ${pesoActual}kg en "${nombre}" — quizás sea buen momento para subir un poco (ej: ${pesoSugerido}kg).`,
    });
  }

  return sugerencias;
};

/* =======================================================
   🟢 Crear un registro de entrenamiento (siempre para uno mismo).
   POST /entrenamiento-personal/registro
======================================================= */
export const crearRegistroEntrenamiento = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const { fecha, tipoActividad, duracionMinutos, notas, ejercicios } = req.body;

    if (!tipoActividad || !NOMBRES_GRUPO[tipoActividad]) {
      return err(res, "Indica qué entrenaste (grupo muscular, cardio, fútbol, etc.)", 400);
    }

    // Detalle opcional por máquina/ejercicio — nada de esto es obligatorio.
    const ejerciciosLimpios = Array.isArray(ejercicios)
      ? ejercicios
          .filter((e) => e && typeof e.nombre === "string" && e.nombre.trim())
          .map((e) => ({
            nombre: e.nombre.trim().slice(0, 80),
            pesoKg: e.pesoKg === "" || e.pesoKg == null ? null : Number(e.pesoKg),
            series: e.series === "" || e.series == null ? null : Number(e.series),
            repeticiones: e.repeticiones === "" || e.repeticiones == null ? null : Number(e.repeticiones),
          }))
      : [];

    const registro = await RegistroEntrenamientoModel.create({
      empresa: empresaId,
      cliente: req.usuario.id,
      fecha: fecha ? new Date(fecha) : new Date(),
      tipoActividad,
      duracionMinutos: duracionMinutos ?? null,
      notas: notas || "",
      ejercicios: ejerciciosLimpios,
    });

    // Suma cada ejercicio nuevo al catálogo de la empresa, para que se
    // sugiera por autocompletado la próxima vez (a este mismo usuario y a
    // sus amigos de la misma empresa). No es una API externa de "máquinas
    // de gimnasio" — no existe una confiable y genérica para eso, cada
    // gimnasio tiene equipos distintos — así que este catálogo se arma
    // solo con lo que la propia gente va registrando.
    for (const e of ejerciciosLimpios) {
      try {
        await EjercicioCatalogoModel.updateOne(
          { empresa: empresaId, nombreNormalizado: e.nombre.toLowerCase() },
          {
            $setOnInsert: {
              empresa: empresaId,
              nombre: e.nombre,
              nombreNormalizado: e.nombre.toLowerCase(),
            },
          },
          { upsert: true },
        );
      } catch (errCatalogo) {
        console.error("Aviso: no se pudo actualizar el catálogo de ejercicios:", errCatalogo.message);
      }
    }

    return res.status(201).json({ ok: true, data: registro });
  } catch (error) {
    console.error("Error al crear registro de entrenamiento:", error);
    return err(res, "Error interno al guardar el registro");
  }
};

/* =======================================================
   🟣 Mis registros (historial propio, ventana de días).
   GET /entrenamiento-personal/mis-registros?dias=60
======================================================= */
export const listarMisRegistrosEntrenamiento = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const dias = Math.min(Number(req.query.dias) || 60, 365);
    const desde = dayjs().tz(TZ).subtract(dias, "day").startOf("day").toDate();

    const registros = await RegistroEntrenamientoModel.find({
      empresa: empresaId,
      cliente: req.usuario.id,
      fecha: { $gte: desde },
    }).sort({ fecha: 1 });

    return ok(res, { registros });
  } catch (error) {
    console.error("Error al listar registros de entrenamiento:", error);
    return err(res, "Error interno al obtener tus registros");
  }
};

/* =======================================================
   🟡 Catálogo de ejercicios/máquinas de la empresa (autocompletado).
   GET /entrenamiento-personal/catalogo-ejercicios
======================================================= */
export const listarCatalogoEjercicios = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const catalogo = await EjercicioCatalogoModel.find({ empresa: empresaId })
      .select("nombre")
      .sort({ nombre: 1 })
      .lean();

    return ok(res, { catalogo: catalogo.map((c) => c.nombre) });
  } catch (error) {
    console.error("Error al listar catálogo de ejercicios:", error);
    return err(res, "Error interno al obtener el catálogo de ejercicios");
  }
};

/* =======================================================
   🔴 Eliminar un registro propio.
   DELETE /entrenamiento-personal/registro/:id
======================================================= */
export const eliminarRegistroEntrenamiento = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const { id } = req.params;

    const registro = await RegistroEntrenamientoModel.findOne({
      _id: id,
      empresa: empresaId,
      cliente: req.usuario.id,
    });
    if (!registro) {
      return err(res, "No se encontró el registro", 404);
    }

    await registro.deleteOne();
    return ok(res, { eliminado: true });
  } catch (error) {
    console.error("Error al eliminar registro de entrenamiento:", error);
    return err(res, "Error interno al eliminar el registro");
  }
};

/* =======================================================
   ⭐ Cálculo de progreso de entrenamiento: racha, hitos, resumen
   mensual, sugerencia de hoy, sugerencias de peso por ejercicio y aviso
   de constancia.

   Extraído como función propia (no como handler HTTP) para poder
   reutilizarlo tanto en GET /entrenamiento-personal/mi-progreso como en
   el cron diario que manda el correo motivacional (ver
   cron/entrenamientoPersonalCron.js) — así ambos calculan exactamente lo
   mismo, no hay dos lógicas que puedan desincronizarse.
======================================================= */
export const calcularProgresoEntrenamiento = async (empresaId, clienteId) => {
  const ahora = dayjs().tz(TZ);
  const hoyStr = ahora.format("YYYY-MM-DD");

  // Un año hacia atrás alcanza de sobra para racha/hitos de uso personal.
  const desde = ahora.subtract(365, "day").startOf("day").toDate();
  const registros = await RegistroEntrenamientoModel.find({
    empresa: empresaId,
    cliente: clienteId,
    fecha: { $gte: desde },
  })
    .sort({ fecha: 1 })
    .lean();

  const totalHistorico = registros.length;

  // ── Resumen mensual (mes calendario actual vs. el anterior) ──
  const inicioMes = ahora.startOf("month");
  const inicioMesAnterior = inicioMes.subtract(1, "month");
  let esteMes = 0;
  let mesAnterior = 0;
  let minutosEsteMes = 0;
  for (const r of registros) {
    const f = dayjs(r.fecha).tz(TZ);
    if (!f.isBefore(inicioMes)) {
      esteMes += 1;
      minutosEsteMes += r.duracionMinutos || 0;
    } else if (!f.isBefore(inicioMesAnterior)) {
      mesAnterior += 1;
    }
  }

  // ── Días (calendario) con al menos 1 registro, y último registro por
  // tipo de actividad — bases para racha, streak de descanso y
  // sugerencia del día ──
  const diasConActividad = new Set();
  const ultimaFechaPorTipo = new Map();
  for (const r of registros) {
    const f = dayjs(r.fecha).tz(TZ);
    diasConActividad.add(f.format("YYYY-MM-DD"));
    const actual = ultimaFechaPorTipo.get(r.tipoActividad);
    if (!actual || f.isAfter(actual)) ultimaFechaPorTipo.set(r.tipoActividad, f);
  }

  // ── Racha: semanas consecutivas con al menos 1 registro ──
  const semanasConActividad = new Set(
    registros.map((r) => dayjs(r.fecha).tz(TZ).startOf("week").format("YYYY-MM-DD")),
  );
  let rachaSemanas = 0;
  let cursorSemana = ahora.startOf("week");
  while (semanasConActividad.has(cursorSemana.format("YYYY-MM-DD"))) {
    rachaSemanas += 1;
    cursorSemana = cursorSemana.subtract(1, "week");
  }

  // ── Días consecutivos con actividad, terminando AYER (para decidir si
  // hoy toca sugerir descanso en vez de seguir sumando días seguidos) ──
  let diasSeguidosHastaAyer = 0;
  let cursorDia = ahora.subtract(1, "day");
  while (diasConActividad.has(cursorDia.format("YYYY-MM-DD"))) {
    diasSeguidosHastaAyer += 1;
    cursorDia = cursorDia.subtract(1, "day");
  }

  // ── Días sin ningún registro (para el aviso de constancia) ──
  let diasSinActividad = null;
  if (registros.length > 0) {
    const ultimaFecha = dayjs(registros[registros.length - 1].fecha).tz(TZ);
    diasSinActividad = ahora.startOf("day").diff(ultimaFecha.startOf("day"), "day");
  }

  // ── Hitos por total histórico ──
  const hitos = HITOS_ENTRENAMIENTOS.map((valor) => ({ valor, alcanzado: totalHistorico >= valor }));
  const proximoHito = HITOS_ENTRENAMIENTOS.find((h) => h > totalHistorico) || null;

  // ── ¿Ya registró algo hoy? ──
  const registrosHoy = registros.filter((r) => dayjs(r.fecha).tz(TZ).format("YYYY-MM-DD") === hoyStr);

  // ── Sugerencia de hoy ──
  let sugerencia;
  if (diasSeguidosHastaAyer >= UMBRAL_DIAS_SEGUIDOS_PARA_DESCANSO) {
    sugerencia = {
      tipo: "descanso",
      mensaje: `Llevas ${diasSeguidosHastaAyer} días seguidos activo — hoy es buen día para descansar.`,
    };
  } else {
    // El grupo con más días sin trabajarse (o nunca trabajado) va primero.
    let mejorGrupo = null;
    let mejorDias = -1;
    for (const grupo of GRUPOS_MUSCULARES) {
      const ultima = ultimaFechaPorTipo.get(grupo);
      const dias = ultima ? ahora.startOf("day").diff(ultima.startOf("day"), "day") : Infinity;
      if (dias > mejorDias) {
        mejorDias = dias;
        mejorGrupo = grupo;
      }
    }
    sugerencia = {
      tipo: "grupo",
      grupo: mejorGrupo,
      nombreGrupo: NOMBRES_GRUPO[mejorGrupo],
      diasSinTrabajarlo: mejorDias === Infinity ? null : mejorDias,
      mensaje:
        mejorDias === Infinity
          ? `Hoy podrías partir con ${NOMBRES_GRUPO[mejorGrupo]} — todavía no lo registras.`
          : `Hoy te tocaría ${NOMBRES_GRUPO[mejorGrupo]} — llevas ${mejorDias} día${mejorDias !== 1 ? "s" : ""} sin trabajarlo.`,
    };
  }

  const sugerenciasPeso = calcularSugerenciasPeso(registros, ahora);

  return {
    totalHistorico,
    esteMes,
    mesAnterior,
    variacionMes: variacion(esteMes, mesAnterior),
    minutosEsteMes,
    rachaSemanas,
    hitos,
    proximoHito,
    faltanParaProximoHito: proximoHito ? proximoHito - totalHistorico : null,
    diasSinActividad,
    avisoConstancia: diasSinActividad !== null && diasSinActividad >= UMBRAL_DIAS_SIN_ACTIVIDAD_PARA_AVISO,
    yaRegistroHoy: registrosHoy.length > 0,
    registrosHoy,
    sugerencia,
    sugerenciasPeso,
  };
};

/* =======================================================
   ⭐ Mi progreso de entrenamiento (handler HTTP).
   GET /entrenamiento-personal/mi-progreso
======================================================= */
export const getMiProgresoEntrenamiento = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const clienteId = req.usuario.id;
    const data = await calcularProgresoEntrenamiento(empresaId, clienteId);
    return ok(res, data);
  } catch (error) {
    console.error("Error al obtener el progreso de entrenamiento:", error);
    return err(res, "Error interno al obtener tu progreso");
  }
};
