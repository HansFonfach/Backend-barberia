import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

import RegistroEntrenamientoModel from "../models/registroEntrenamiento.model.js";
import EjercicioCatalogoModel from "../models/ejercicioCatalogo.model.js";
import UsuarioModel from "../models/usuario.model.js";
import MedicionCorporalModel from "../models/medicionCorporal.model.js";

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

// Perfil de entrenamiento (objetivo, sexo biológico, fecha de nacimiento):
// 100% opcional, lo completa el cliente si quiere. Se usa solo para la
// calculadora de calorías/macros y la rutina sugerida — nunca para
// etiquetar a la persona.
const OBJETIVOS_VALIDOS = ["bajar_grasa", "subir_masa", "mantenimiento", "resistencia"];
const SEXOS_VALIDOS = ["masculino", "femenino"];
const NOMBRES_OBJETIVO = {
  bajar_grasa: "Bajar grasa",
  subir_masa: "Subir masa muscular",
  mantenimiento: "Mantenerme",
  resistencia: "Mejorar resistencia",
};

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

/* =======================================================
   👤 Perfil de entrenamiento (objetivo, sexo biológico, fecha de
   nacimiento). Opcional — se usa solo para la calculadora de calorías y
   la rutina sugerida (ver más abajo).
   GET /entrenamiento-personal/perfil
======================================================= */
export const getMiPerfilEntrenamiento = async (req, res) => {
  try {
    const usuario = await UsuarioModel.findById(req.usuario.id)
      .select("perfilEntrenamiento")
      .lean();
    const perfil = usuario?.perfilEntrenamiento || {};
    return ok(res, {
      objetivo: perfil.objetivo || null,
      sexoBiologico: perfil.sexoBiologico || null,
      fechaNacimiento: perfil.fechaNacimiento || null,
    });
  } catch (error) {
    console.error("Error al obtener perfil de entrenamiento:", error);
    return err(res, "Error interno al obtener tu perfil");
  }
};

/* =======================================================
   👤 Actualizar perfil de entrenamiento (parcial — cada campo es
   independiente, mandar null/"" en uno lo borra sin tocar los demás).
   PUT /entrenamiento-personal/perfil
======================================================= */
export const actualizarPerfilEntrenamiento = async (req, res) => {
  try {
    const { objetivo, sexoBiologico, fechaNacimiento } = req.body;

    if (objetivo !== undefined && objetivo !== null && objetivo !== "" && !OBJETIVOS_VALIDOS.includes(objetivo)) {
      return err(res, "Objetivo inválido", 400);
    }
    if (
      sexoBiologico !== undefined &&
      sexoBiologico !== null &&
      sexoBiologico !== "" &&
      !SEXOS_VALIDOS.includes(sexoBiologico)
    ) {
      return err(res, "Sexo biológico inválido", 400);
    }

    let fechaNacimientoParseada;
    if (fechaNacimiento === undefined) {
      fechaNacimientoParseada = undefined; // no se toca
    } else if (fechaNacimiento === null || fechaNacimiento === "") {
      fechaNacimientoParseada = null; // se borra
    } else {
      const f = new Date(fechaNacimiento);
      if (Number.isNaN(f.getTime())) return err(res, "Fecha de nacimiento inválida", 400);
      fechaNacimientoParseada = f;
    }

    const set = {};
    if (objetivo !== undefined) set["perfilEntrenamiento.objetivo"] = objetivo || null;
    if (sexoBiologico !== undefined) set["perfilEntrenamiento.sexoBiologico"] = sexoBiologico || null;
    if (fechaNacimientoParseada !== undefined) {
      set["perfilEntrenamiento.fechaNacimiento"] = fechaNacimientoParseada;
    }

    const usuario = await UsuarioModel.findByIdAndUpdate(req.usuario.id, { $set: set }, { new: true }).select(
      "perfilEntrenamiento",
    );

    return ok(res, {
      objetivo: usuario.perfilEntrenamiento?.objetivo || null,
      sexoBiologico: usuario.perfilEntrenamiento?.sexoBiologico || null,
      fechaNacimiento: usuario.perfilEntrenamiento?.fechaNacimiento || null,
    });
  } catch (error) {
    console.error("Error al actualizar perfil de entrenamiento:", error);
    return err(res, "Error interno al guardar tu perfil");
  }
};

/* =======================================================
   🥗 Recomendación nutricional: calorías y macros calculados con la
   fórmula Mifflin-St Jeor (TMB) a partir de datos reales — peso/altura de
   la bitácora, edad/sexo del perfil, y el nivel de actividad derivado de
   los entrenamientos REALES registrados en los últimos 30 días (no una
   autoevaluación tipo "sedentario/activo"). Si falta algún dato, se
   devuelve disponible:false con la lista de lo que falta, para que el
   frontend le pida exactamente eso al usuario — nunca se inventa un valor.
   GET /entrenamiento-personal/recomendacion-nutricional
======================================================= */
const MULTIPLICADOR_ACTIVIDAD = [
  { max: 3, valor: 1.2, etiqueta: "sedentario (0-3 entrenamientos/mes registrados)" },
  { max: 8, valor: 1.375, etiqueta: "actividad ligera (4-8 entrenamientos/mes registrados)" },
  { max: 16, valor: 1.55, etiqueta: "actividad moderada (9-16 entrenamientos/mes registrados)" },
  { max: 24, valor: 1.725, etiqueta: "muy activo (17-24 entrenamientos/mes registrados)" },
  { max: Infinity, valor: 1.9, etiqueta: "extremadamente activo (25+ entrenamientos/mes registrados)" },
];

const AJUSTE_POR_OBJETIVO = {
  bajar_grasa: { factor: 0.8, proteinaGPorKg: 2.2, etiqueta: "déficit ~20% para bajar grasa" },
  subir_masa: { factor: 1.1, proteinaGPorKg: 2.0, etiqueta: "superávit ~10% para subir masa" },
  mantenimiento: { factor: 1.0, proteinaGPorKg: 1.8, etiqueta: "mantenimiento" },
  resistencia: { factor: 1.0, proteinaGPorKg: 1.6, etiqueta: "mantenimiento, priorizando carbohidratos" },
};

const calcularEdad = (fechaNacimiento) => {
  const hoy = dayjs().tz(TZ);
  const nacimiento = dayjs(fechaNacimiento).tz(TZ);
  let edad = hoy.year() - nacimiento.year();
  const aunNoCumple =
    hoy.month() < nacimiento.month() || (hoy.month() === nacimiento.month() && hoy.date() < nacimiento.date());
  if (aunNoCumple) edad -= 1;
  return edad;
};

export const getRecomendacionNutricional = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const clienteId = req.usuario.id;

    const usuario = await UsuarioModel.findById(clienteId).select("perfilEntrenamiento").lean();
    const perfil = usuario?.perfilEntrenamiento || {};

    const mediciones = await MedicionCorporalModel.find({ empresa: empresaId, cliente: clienteId })
      .sort({ fecha: -1 })
      .lean();
    const pesoKg = mediciones.find((m) => m.pesoKg != null)?.pesoKg ?? null;
    const alturaCm = mediciones.find((m) => m.alturaCm != null)?.alturaCm ?? null;

    const faltantes = [];
    if (!perfil.objetivo) faltantes.push("objetivo");
    if (!perfil.sexoBiologico) faltantes.push("sexoBiologico");
    if (!perfil.fechaNacimiento) faltantes.push("fechaNacimiento");
    if (pesoKg == null) faltantes.push("pesoKg");
    if (alturaCm == null) faltantes.push("alturaCm");

    if (faltantes.length > 0) {
      return ok(res, { disponible: false, faltantes });
    }

    const edad = calcularEdad(perfil.fechaNacimiento);

    const tmb =
      perfil.sexoBiologico === "masculino"
        ? 10 * pesoKg + 6.25 * alturaCm - 5 * edad + 5
        : 10 * pesoKg + 6.25 * alturaCm - 5 * edad - 161;

    const desde30 = dayjs().tz(TZ).subtract(30, "day").startOf("day").toDate();
    const entrenamientosUltimos30Dias = await RegistroEntrenamientoModel.countDocuments({
      empresa: empresaId,
      cliente: clienteId,
      fecha: { $gte: desde30 },
    });
    const nivel =
      MULTIPLICADOR_ACTIVIDAD.find((n) => entrenamientosUltimos30Dias <= n.max) ||
      MULTIPLICADOR_ACTIVIDAD[MULTIPLICADOR_ACTIVIDAD.length - 1];

    const caloriasMantenimiento = Math.round(tmb * nivel.valor);
    const ajuste = AJUSTE_POR_OBJETIVO[perfil.objetivo];
    const caloriasObjetivo = Math.round(caloriasMantenimiento * ajuste.factor);

    const proteinaG = Math.round(pesoKg * ajuste.proteinaGPorKg);
    const grasaG = Math.round((caloriasObjetivo * 0.25) / 9);
    const kcalRestantes = Math.max(caloriasObjetivo - proteinaG * 4 - grasaG * 9, 0);
    const carbohidratosG = Math.round(kcalRestantes / 4);

    return ok(res, {
      disponible: true,
      datosUsados: {
        pesoKg,
        alturaCm,
        edad,
        sexoBiologico: perfil.sexoBiologico,
        objetivo: perfil.objetivo,
        nombreObjetivo: NOMBRES_OBJETIVO[perfil.objetivo],
        entrenamientosUltimos30Dias,
        nivelActividad: nivel.etiqueta,
      },
      tmb: Math.round(tmb),
      caloriasMantenimiento,
      caloriasObjetivo,
      ajusteObjetivo: ajuste.etiqueta,
      macros: { proteinaG, grasaG, carbohidratosG },
      disclaimer:
        "Calculado con la fórmula Mifflin-St Jeor a partir de tus propios datos (peso, altura, edad, sexo y tu frecuencia real de entrenamiento) — es una estimación, no un plan médico. Para algo ajustado en detalle a tu caso, lo ideal es un nutricionista.",
    });
  } catch (error) {
    console.error("Error al calcular recomendación nutricional:", error);
    return err(res, "Error interno al calcular tu recomendación");
  }
};

/* =======================================================
   🏋️ Rutina sugerida por objetivo: plantillas fijas (splits reales, no
   generadas por IA) que el cliente puede usar tal cual, editar y guardar
   como su propia Rutina (POST /entrenamiento-personal/rutina) — esto NO
   crea nada por sí solo, solo devuelve la sugerencia para que el frontend
   prellene el formulario.
   GET /entrenamiento-personal/rutina-sugerida
======================================================= */
const PLANTILLAS_RUTINA = {
  bajar_grasa: {
    notaGeneral:
      "3 sesiones de fuerza full-body a la semana (ej: lunes/miércoles/viernes) + 2 sesiones de cardio de 20-30 min los días que no entrenas fuerza. El déficit calórico es lo que más pesa para bajar grasa — el entrenamiento ayuda a que ese peso que bajas sea principalmente grasa y no músculo.",
    dias: [
      {
        nombre: "Full body A",
        grupoMuscular: "piernas",
        ejercicios: [
          { nombre: "Sentadilla", series: 3, repeticiones: 12 },
          { nombre: "Press banca o flexiones", series: 3, repeticiones: 12 },
          { nombre: "Remo con barra o máquina", series: 3, repeticiones: 12 },
          { nombre: "Plancha", series: 3, repeticiones: 30 },
        ],
      },
      {
        nombre: "Full body B",
        grupoMuscular: "espalda",
        ejercicios: [
          { nombre: "Peso muerto o hip thrust", series: 3, repeticiones: 12 },
          { nombre: "Press militar", series: 3, repeticiones: 12 },
          { nombre: "Jalón al pecho o dominadas asistidas", series: 3, repeticiones: 12 },
          { nombre: "Elevaciones de piernas", series: 3, repeticiones: 15 },
        ],
      },
      {
        nombre: "Full body C",
        grupoMuscular: "otro",
        ejercicios: [
          { nombre: "Zancadas", series: 3, repeticiones: 12 },
          { nombre: "Press inclinado con mancuernas", series: 3, repeticiones: 12 },
          { nombre: "Remo con mancuerna a un brazo", series: 3, repeticiones: 12 },
          { nombre: "Abdominales", series: 3, repeticiones: 15 },
        ],
      },
    ],
  },
  subir_masa: {
    notaGeneral:
      "Split empuje/tirón/pierna, idealmente 4-6 sesiones a la semana (puedes repetir el ciclo 2 veces). Rango de 6-10 repeticiones, buen descanso entre series (60-90 seg). La progresión de peso (ver 'Momento de subir peso' en Mi entrenamiento) es clave acá.",
    dias: [
      {
        nombre: "Empuje (pecho / hombro / tríceps)",
        grupoMuscular: "pecho",
        ejercicios: [
          { nombre: "Press banca", series: 4, repeticiones: 8 },
          { nombre: "Press militar", series: 4, repeticiones: 8 },
          { nombre: "Press inclinado con mancuernas", series: 3, repeticiones: 10 },
          { nombre: "Extensión de tríceps en polea", series: 3, repeticiones: 12 },
        ],
      },
      {
        nombre: "Tirón (espalda / bíceps)",
        grupoMuscular: "espalda",
        ejercicios: [
          { nombre: "Peso muerto", series: 4, repeticiones: 6 },
          { nombre: "Dominadas o jalón al pecho", series: 4, repeticiones: 8 },
          { nombre: "Remo con barra", series: 3, repeticiones: 10 },
          { nombre: "Curl de bíceps con barra", series: 3, repeticiones: 12 },
        ],
      },
      {
        nombre: "Pierna",
        grupoMuscular: "piernas",
        ejercicios: [
          { nombre: "Sentadilla", series: 4, repeticiones: 8 },
          { nombre: "Prensa de piernas", series: 3, repeticiones: 10 },
          { nombre: "Curl femoral", series: 3, repeticiones: 12 },
          { nombre: "Elevación de talones (gemelos)", series: 4, repeticiones: 15 },
        ],
      },
    ],
  },
  mantenimiento: {
    notaGeneral:
      "3 sesiones full-body a la semana alcanza para mantener lo que ya tienes, con volumen moderado. Si sientes que quieres progresar más en algún sentido, considera cambiar tu objetivo a 'Bajar grasa' o 'Subir masa' según lo que busques.",
    dias: [
      {
        nombre: "Full body A",
        grupoMuscular: "piernas",
        ejercicios: [
          { nombre: "Sentadilla", series: 3, repeticiones: 10 },
          { nombre: "Press banca", series: 3, repeticiones: 10 },
          { nombre: "Remo con barra", series: 3, repeticiones: 10 },
        ],
      },
      {
        nombre: "Full body B",
        grupoMuscular: "espalda",
        ejercicios: [
          { nombre: "Peso muerto rumano", series: 3, repeticiones: 10 },
          { nombre: "Press militar", series: 3, repeticiones: 10 },
          { nombre: "Jalón al pecho", series: 3, repeticiones: 10 },
        ],
      },
      {
        nombre: "Full body C",
        grupoMuscular: "otro",
        ejercicios: [
          { nombre: "Zancadas", series: 3, repeticiones: 10 },
          { nombre: "Press inclinado con mancuernas", series: 3, repeticiones: 10 },
          { nombre: "Remo con mancuerna", series: 3, repeticiones: 10 },
        ],
      },
    ],
  },
  resistencia: {
    notaGeneral:
      "Circuitos con más repeticiones y menos peso, poco descanso entre series, + 3 sesiones de cardio a la semana (30-40 min: trote, bici, natación). La idea es acostumbrar al cuerpo a sostener esfuerzo por más tiempo, no a mover el máximo peso posible.",
    dias: [
      {
        nombre: "Circuito full body A",
        grupoMuscular: "cardio",
        ejercicios: [
          { nombre: "Sentadilla", series: 3, repeticiones: 20 },
          { nombre: "Flexiones", series: 3, repeticiones: 15 },
          { nombre: "Remo con banda o máquina", series: 3, repeticiones: 20 },
          { nombre: "Burpees", series: 3, repeticiones: 12 },
        ],
      },
      {
        nombre: "Circuito full body B",
        grupoMuscular: "cardio",
        ejercicios: [
          { nombre: "Zancadas", series: 3, repeticiones: 20 },
          { nombre: "Press militar con mancuernas", series: 3, repeticiones: 15 },
          { nombre: "Jalón al pecho", series: 3, repeticiones: 20 },
          { nombre: "Plancha", series: 3, repeticiones: 45 },
        ],
      },
    ],
  },
};

export const getRutinaSugerida = async (req, res) => {
  try {
    const usuario = await UsuarioModel.findById(req.usuario.id).select("perfilEntrenamiento").lean();
    const objetivo = usuario?.perfilEntrenamiento?.objetivo || null;

    if (!objetivo) {
      return ok(res, {
        disponible: false,
        mensaje: "Define tu objetivo en tu perfil de entrenamiento para ver una rutina sugerida.",
      });
    }

    const plantilla = PLANTILLAS_RUTINA[objetivo];
    return ok(res, {
      disponible: true,
      objetivo,
      nombreObjetivo: NOMBRES_OBJETIVO[objetivo],
      notaGeneral: plantilla.notaGeneral,
      dias: plantilla.dias,
      disclaimer:
        "Rutina de referencia general (splits y rangos de repeticiones estándar) — ajusta pesos, series o ejercicios según cómo te sientas. Úsala como base, no como receta fija: puedes editarla antes de guardarla como tuya.",
    });
  } catch (error) {
    console.error("Error al obtener rutina sugerida:", error);
    return err(res, "Error interno al obtener la rutina sugerida");
  }
};

/* =======================================================
   👥 Miembros de la empresa (dueño + amigos invitados) — SOLO ADMIN. Lista
   simple con la actividad de cada uno (total de entrenamientos + fecha del
   último), no el panel completo de gestión de clientes (ese trae de vuelta
   reservas/suscripciones/membresías, que no aplican acá — ver comentario
   en routes.js sobre por qué se sacó "Clientes" para este módulo).
   GET /entrenamiento-personal/miembros
   Mismo criterio de "quién cuenta" que el cron de correo motivacional
   (entrenamientoPersonalCron.js): activo, no eliminado, no invitado sin
   registrar todavía.
======================================================= */
export const listarMiembrosEmpresa = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;

    const usuarios = await UsuarioModel.find({
      empresa: empresaId,
      estado: "activo",
      deletedAt: null,
      rol: { $ne: "invitado" },
    })
      .select("nombre apellido email createdAt esAdmin")
      .sort({ createdAt: 1 })
      .lean();

    const registros = await RegistroEntrenamientoModel.find({ empresa: empresaId })
      .select("cliente fecha")
      .lean();

    const actividadPorCliente = new Map();
    for (const r of registros) {
      const clave = String(r.cliente);
      const actual = actividadPorCliente.get(clave) || { total: 0, ultima: null };
      actual.total += 1;
      if (!actual.ultima || r.fecha > actual.ultima) actual.ultima = r.fecha;
      actividadPorCliente.set(clave, actual);
    }

    const miembros = usuarios.map((u) => {
      const actividad = actividadPorCliente.get(String(u._id)) || { total: 0, ultima: null };
      return {
        _id: u._id,
        nombre: u.nombre,
        apellido: u.apellido || "",
        email: u.email,
        esAdmin: !!u.esAdmin,
        fechaRegistro: u.createdAt,
        totalEntrenamientos: actividad.total,
        ultimoEntrenamiento: actividad.ultima,
      };
    });

    return ok(res, { miembros });
  } catch (error) {
    console.error("Error al listar miembros de la empresa:", error);
    return err(res, "Error interno al obtener los miembros");
  }
};

/* =======================================================
   🔎 Buscar a alguien de tu misma empresa por RUT — para compartir una
   rutina DIRECTAMENTE con esa persona (ver rutinaController.js /
   compartidaConUsuarios). Cualquier cliente puede usarla (no es solo
   admin), pero solo devuelve lo mínimo (nombre) — nada de email, teléfono
   ni puntos, a diferencia de la búsqueda de "Agendar cliente" que ya
   existe para otros rubros y sí expone ese detalle a profesionales/admin.
   GET /entrenamiento-personal/buscar-miembro/:rut
======================================================= */
export const buscarMiembroPorRut = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const rutBuscado = String(req.params.rut || "").replace(/[.\-]/g, "").toUpperCase();

    if (!rutBuscado || rutBuscado.length < 2) {
      return err(res, "RUT no válido", 400);
    }

    const candidatos = await UsuarioModel.find({
      empresa: empresaId,
      estado: "activo",
      deletedAt: null,
      rol: { $ne: "invitado" },
      _id: { $ne: req.usuario.id },
      rut: { $exists: true, $ne: null },
    })
      .select("nombre apellido rut")
      .lean();

    const encontrado = candidatos.find(
      (u) => String(u.rut || "").replace(/[.\-]/g, "").toUpperCase() === rutBuscado,
    );

    if (!encontrado) {
      return err(res, "No se encontró a nadie con ese RUT en tu empresa", 404);
    }

    return ok(res, {
      _id: encontrado._id,
      nombre: encontrado.nombre,
      apellido: encontrado.apellido || "",
    });
  } catch (error) {
    console.error("Error al buscar miembro por RUT:", error);
    return err(res, "Error interno al buscar");
  }
};
