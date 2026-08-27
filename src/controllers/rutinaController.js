import RutinaModel from "../models/rutina.model.js";

// Rutinas de entrenamiento (modulos.entrenamientoPersonal): cada cliente
// arma sus propias rutinas y decide, rutina por rutina, si la comparte
// con el resto de la empresa (dueño + amigos invitados) o la deja
// privada. Ver comentario en models/rutina.model.js.

const ok = (res, data) => res.json({ ok: true, data });
const err = (res, msg, status = 500) =>
  res.status(status).json({ ok: false, message: msg });

const GRUPOS_VALIDOS = [
  "pecho",
  "espalda",
  "piernas",
  "hombros",
  "brazos",
  "core",
  "cardio",
  "otro",
];

const limpiarEjercicios = (ejercicios) =>
  Array.isArray(ejercicios)
    ? ejercicios
        .filter((e) => e && typeof e.nombre === "string" && e.nombre.trim())
        .map((e) => ({
          nombre: e.nombre.trim().slice(0, 80),
          series: e.series === "" || e.series == null ? null : Number(e.series),
          repeticiones: e.repeticiones === "" || e.repeticiones == null ? null : Number(e.repeticiones),
          pesoKg: e.pesoKg === "" || e.pesoKg == null ? null : Number(e.pesoKg),
        }))
    : [];

/* =======================================================
   🟢 Crear una rutina (siempre para uno mismo).
   POST /entrenamiento-personal/rutina
======================================================= */
export const crearRutina = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const { nombre, grupoMuscular, ejercicios, notas, compartida } = req.body;

    if (!nombre || !nombre.trim()) {
      return err(res, "Ponle un nombre a la rutina (ej: Rutina de pecho)", 400);
    }
    if (!grupoMuscular || !GRUPOS_VALIDOS.includes(grupoMuscular)) {
      return err(res, "Indica a qué grupo corresponde la rutina", 400);
    }

    const rutina = await RutinaModel.create({
      empresa: empresaId,
      cliente: req.usuario.id,
      nombre: nombre.trim().slice(0, 80),
      grupoMuscular,
      ejercicios: limpiarEjercicios(ejercicios),
      notas: notas || "",
      compartida: !!compartida,
    });

    return res.status(201).json({ ok: true, data: rutina });
  } catch (error) {
    console.error("Error al crear rutina:", error);
    return err(res, "Error interno al guardar la rutina");
  }
};

/* =======================================================
   🟣 Mis rutinas (propias, compartidas o no).
   GET /entrenamiento-personal/mis-rutinas
======================================================= */
export const listarMisRutinas = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;

    const rutinas = await RutinaModel.find({
      empresa: empresaId,
      cliente: req.usuario.id,
    }).sort({ createdAt: -1 });

    return ok(res, { rutinas });
  } catch (error) {
    console.error("Error al listar mis rutinas:", error);
    return err(res, "Error interno al obtener tus rutinas");
  }
};

/* =======================================================
   🔵 Rutinas que otros de la misma empresa compartieron.
   GET /entrenamiento-personal/rutinas-compartidas
======================================================= */
export const listarRutinasCompartidas = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;

    const rutinas = await RutinaModel.find({
      empresa: empresaId,
      compartida: true,
    })
      .sort({ createdAt: -1 })
      .populate("cliente", "nombre")
      .lean();

    const conAutor = rutinas.map((r) => ({
      ...r,
      autorNombre: r.cliente?.nombre || "Alguien de tu empresa",
      cliente: undefined,
    }));

    return ok(res, { rutinas: conAutor });
  } catch (error) {
    console.error("Error al listar rutinas compartidas:", error);
    return err(res, "Error interno al obtener las rutinas compartidas");
  }
};

/* =======================================================
   🟠 Editar una rutina propia (incluye compartir/ocultar).
   PUT /entrenamiento-personal/rutina/:id
======================================================= */
export const actualizarRutina = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const { id } = req.params;
    const { nombre, grupoMuscular, ejercicios, notas, compartida } = req.body;

    const rutina = await RutinaModel.findOne({
      _id: id,
      empresa: empresaId,
      cliente: req.usuario.id,
    });
    if (!rutina) {
      return err(res, "No se encontró la rutina", 404);
    }

    if (nombre !== undefined) {
      if (!nombre.trim()) return err(res, "El nombre no puede quedar vacío", 400);
      rutina.nombre = nombre.trim().slice(0, 80);
    }
    if (grupoMuscular !== undefined) {
      if (!GRUPOS_VALIDOS.includes(grupoMuscular)) {
        return err(res, "Grupo muscular inválido", 400);
      }
      rutina.grupoMuscular = grupoMuscular;
    }
    if (ejercicios !== undefined) rutina.ejercicios = limpiarEjercicios(ejercicios);
    if (notas !== undefined) rutina.notas = notas;
    if (compartida !== undefined) rutina.compartida = !!compartida;

    await rutina.save();
    return ok(res, rutina);
  } catch (error) {
    console.error("Error al actualizar rutina:", error);
    return err(res, "Error interno al actualizar la rutina");
  }
};

/* =======================================================
   🔴 Eliminar una rutina propia.
   DELETE /entrenamiento-personal/rutina/:id
======================================================= */
export const eliminarRutina = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const { id } = req.params;

    const rutina = await RutinaModel.findOne({
      _id: id,
      empresa: empresaId,
      cliente: req.usuario.id,
    });
    if (!rutina) {
      return err(res, "No se encontró la rutina", 404);
    }

    await rutina.deleteOne();
    return ok(res, { eliminado: true });
  } catch (error) {
    console.error("Error al eliminar rutina:", error);
    return err(res, "Error interno al eliminar la rutina");
  }
};
