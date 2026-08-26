import PlanMembresiaClase from "../models/planMembresiaClase.model.js";
import MembresiaClase from "../models/membresiaClase.model.js";
import EmpresaModel from "../models/empresa.model.js";

const TIPOS_CICLO_VALIDOS = ["total", "mensual"];

// Validación numérica compartida entre crearPlan/actualizarPlan — antes un
// número negativo/NaN llegaba directo a Mongoose y volvía como un 500
// genérico ("Error interno al crear el plan"); acá se corta antes con un 400
// claro. `campo` ya viene con el valor a validar (puede ser undefined en
// actualizarPlan, donde solo se valida lo que el admin mandó a cambiar).
const validarNumeroPositivo = (valor, { minimo = 0, entero = false } = {}) => {
  if (valor === undefined) return { ok: true };
  const num = Number(valor);
  if (!Number.isFinite(num) || num < minimo || (entero && !Number.isInteger(num))) {
    return { ok: false };
  }
  return { ok: true, num };
};

/* =======================================================
   🌐 Catálogo público de planes (landing de la empresa, sin login) — mismo
   patrón que getServiciosPublicos/getClasesPublicas
======================================================= */
export const getPlanesPublicos = async (req, res) => {
  try {
    const { slug } = req.params;

    const empresa = await EmpresaModel.findOne({ slug });
    if (!empresa || !empresa.modulos?.clasesGrupales) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    const planes = await PlanMembresiaClase.find({
      empresa: empresa._id,
      activo: true,
    })
      .select("nombre clasesIncluidas precio duracionDias tipoCiclo")
      .sort({ precio: 1 });

    return res.json({ planes });
  } catch (error) {
    console.error("Error al listar planes públicos:", error);
    return res
      .status(500)
      .json({ message: "Error interno al listar los planes" });
  }
};

/* =======================================================
   🟢 Crear plan (ej. "Plan 8 clases", $25.000, 30 días)
======================================================= */
export const crearPlan = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const { nombre, clasesIncluidas, precio, duracionDias, tipoCiclo } = req.body;

    if (!nombre || !clasesIncluidas || precio === undefined) {
      return res.status(400).json({
        message: "Nombre, cantidad de clases incluidas y precio son obligatorios",
      });
    }

    if (tipoCiclo !== undefined && !TIPOS_CICLO_VALIDOS.includes(tipoCiclo)) {
      return res.status(400).json({ message: "Tipo de ciclo inválido" });
    }

    const clases = validarNumeroPositivo(clasesIncluidas, { minimo: 1, entero: true });
    const precioValido = validarNumeroPositivo(precio, { minimo: 0 });
    const duracion = validarNumeroPositivo(duracionDias, { minimo: 1, entero: true });
    if (!clases.ok || !precioValido.ok || !duracion.ok) {
      return res.status(400).json({
        message: "Revisa los números: clases incluidas y duración deben ser mayores a 0, y el precio no puede ser negativo",
      });
    }

    const plan = await PlanMembresiaClase.create({
      empresa: empresaId,
      nombre,
      clasesIncluidas: clases.num,
      precio: precioValido.num,
      duracionDias: duracion.num ?? 30,
      tipoCiclo: tipoCiclo || "total",
    });

    return res.status(201).json({ message: "Plan creado correctamente", plan });
  } catch (error) {
    console.error("Error al crear plan de membresía:", error);
    return res.status(500).json({ message: "Error interno al crear el plan" });
  }
};

/* =======================================================
   🔵 Listar planes de la empresa
======================================================= */
export const listarPlanes = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const { todos } = req.query;

    const filtro = { empresa: empresaId };
    if (todos !== "true") filtro.activo = true;

    const planes = await PlanMembresiaClase.find(filtro).sort({ precio: 1 });

    return res.json({ planes });
  } catch (error) {
    console.error("Error al listar planes de membresía:", error);
    return res
      .status(500)
      .json({ message: "Error interno al listar los planes" });
  }
};

/* =======================================================
   🟡 Actualizar plan
======================================================= */
export const actualizarPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const empresaId = req.usuario.empresaId;

    const plan = await PlanMembresiaClase.findOne({ _id: id, empresa: empresaId });
    if (!plan) {
      return res.status(404).json({ message: "Plan no encontrado" });
    }

    if (
      req.body.tipoCiclo !== undefined &&
      !TIPOS_CICLO_VALIDOS.includes(req.body.tipoCiclo)
    ) {
      return res.status(400).json({ message: "Tipo de ciclo inválido" });
    }

    const clases = validarNumeroPositivo(req.body.clasesIncluidas, { minimo: 1, entero: true });
    const precioValido = validarNumeroPositivo(req.body.precio, { minimo: 0 });
    const duracion = validarNumeroPositivo(req.body.duracionDias, { minimo: 1, entero: true });
    if (!clases.ok || !precioValido.ok || !duracion.ok) {
      return res.status(400).json({
        message: "Revisa los números: clases incluidas y duración deben ser mayores a 0, y el precio no puede ser negativo",
      });
    }

    const campos = ["nombre", "clasesIncluidas", "precio", "duracionDias", "tipoCiclo"];
    for (const campo of campos) {
      if (req.body[campo] === undefined) continue;
      if (campo === "clasesIncluidas") plan.clasesIncluidas = clases.num;
      else if (campo === "precio") plan.precio = precioValido.num;
      else if (campo === "duracionDias") plan.duracionDias = duracion.num;
      else plan[campo] = req.body[campo];
    }

    await plan.save();

    return res.json({ message: "Plan actualizado correctamente", plan });
  } catch (error) {
    console.error("Error al actualizar plan de membresía:", error);
    return res
      .status(500)
      .json({ message: "Error interno al actualizar el plan" });
  }
};

/* =======================================================
   🟣 Activar / desactivar plan
======================================================= */
export const toggleActivoPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const empresaId = req.usuario.empresaId;

    const plan = await PlanMembresiaClase.findOne({ _id: id, empresa: empresaId });
    if (!plan) {
      return res.status(404).json({ message: "Plan no encontrado" });
    }

    plan.activo = !plan.activo;
    await plan.save();

    return res.json({
      message: plan.activo ? "Plan activado" : "Plan desactivado",
      plan,
    });
  } catch (error) {
    console.error("Error al cambiar estado del plan:", error);
    return res
      .status(500)
      .json({ message: "Error interno al cambiar el estado del plan" });
  }
};

/* =======================================================
   🔴 Eliminar plan (o desactivar si ya tiene mensualidades vendidas)
======================================================= */
export const eliminarPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const empresaId = req.usuario.empresaId;

    const plan = await PlanMembresiaClase.findOne({ _id: id, empresa: empresaId });
    if (!plan) {
      return res.status(404).json({ message: "Plan no encontrado" });
    }

    const tieneMembresias = await MembresiaClase.exists({ plan: id });
    if (tieneMembresias) {
      plan.activo = false;
      await plan.save();
      return res.json({
        message:
          "El plan tiene mensualidades registradas, así que se desactivó en vez de eliminarse (para no perder el historial)",
        plan,
      });
    }

    await PlanMembresiaClase.deleteOne({ _id: id });

    return res.json({ message: "Plan eliminado correctamente" });
  } catch (error) {
    console.error("Error al eliminar plan de membresía:", error);
    return res
      .status(500)
      .json({ message: "Error interno al eliminar el plan" });
  }
};
