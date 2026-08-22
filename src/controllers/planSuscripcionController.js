// controllers/planSuscripcionController.js
//
// CRUD de plantillas de plan de suscripción, para que el negocio (admin o
// barbero admin) las cree y edite desde la app en vez de que queden
// hardcodeadas en el código (como estaban "creditos", "combo_visita_corte_barba",
// "padre_e_hijo" y "barba"). No reemplaza nada de lo viejo: las
// suscripciones ya creadas con esos tipos siguen funcionando exactamente
// igual (ver suscripcionController.js). Esto solo gestiona los planes que
// se van a poder elegir de ahora en adelante al suscribir a un cliente.
import PlanSuscripcion from "../models/planSuscripcion.model.js";
import Suscripcion from "../models/suscripcion.model.js";
import Empresa from "../models/empresa.model.js";

const camposEditables = [
  "nombre",
  "descripcion",
  "precio",
  "duracionDias",
  "cicloDias",
  "cantidadPorCiclo",
  "serviciosPermitidos",
  "diasVisibilidadCalendario",
];

const validarDatosPlan = (body) => {
  const {
    nombre,
    precio,
    duracionDias,
    cicloDias,
    cantidadPorCiclo,
  } = body;

  if (!nombre || !String(nombre).trim()) {
    return "El nombre del plan es obligatorio";
  }
  if (precio === undefined || Number(precio) < 0) {
    return "Ingresa un precio válido";
  }
  if (!duracionDias || Number(duracionDias) <= 0) {
    return "La duración del plan (en días) debe ser mayor a 0";
  }
  if (!cicloDias || Number(cicloDias) <= 0) {
    return "Los días por ciclo deben ser mayores a 0";
  }
  if (Number(cicloDias) > Number(duracionDias)) {
    return "Los días por ciclo no pueden ser más que la duración total del plan";
  }
  if (!cantidadPorCiclo || Number(cantidadPorCiclo) <= 0) {
    return "La cantidad de servicios por ciclo debe ser mayor a 0";
  }
  return null;
};

/* =======================================================
   🟢 Crear plan
======================================================= */
export const crearPlanSuscripcion = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;

    const empresa = await Empresa.findById(empresaId).select("permiteSuscripcion");
    if (!empresa?.permiteSuscripcion) {
      return res.status(403).json({
        message: "Esta empresa no tiene habilitadas las suscripciones",
      });
    }

    const errorValidacion = validarDatosPlan(req.body);
    if (errorValidacion) {
      return res.status(400).json({ message: errorValidacion });
    }

    const {
      nombre,
      descripcion,
      precio,
      duracionDias,
      cicloDias,
      cantidadPorCiclo,
      serviciosPermitidos,
      diasVisibilidadCalendario,
    } = req.body;

    const plan = await PlanSuscripcion.create({
      empresa: empresaId,
      nombre: String(nombre).trim(),
      descripcion: descripcion || "",
      precio: Number(precio),
      duracionDias: Number(duracionDias),
      cicloDias: Number(cicloDias),
      cantidadPorCiclo: Number(cantidadPorCiclo),
      serviciosPermitidos: Array.isArray(serviciosPermitidos)
        ? serviciosPermitidos
        : [],
      diasVisibilidadCalendario: diasVisibilidadCalendario
        ? Number(diasVisibilidadCalendario)
        : 30,
    });

    return res.status(201).json({ message: "Plan creado correctamente", plan });
  } catch (error) {
    console.error("Error al crear plan de suscripción:", error);
    return res.status(500).json({ message: "Error interno al crear el plan" });
  }
};

/* =======================================================
   🔵 Listar planes de la empresa (con el nombre de los servicios
   permitidos ya poblado, para pintarlos directo en la tabla/selector)
======================================================= */
export const listarPlanesSuscripcion = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const { todos } = req.query;

    const filtro = { empresa: empresaId };
    if (todos !== "true") filtro.activo = true;

    const planes = await PlanSuscripcion.find(filtro)
      .populate("serviciosPermitidos", "nombre")
      .sort({ precio: 1 });

    return res.json({ planes });
  } catch (error) {
    console.error("Error al listar planes de suscripción:", error);
    return res
      .status(500)
      .json({ message: "Error interno al listar los planes" });
  }
};

/* =======================================================
   🟡 Actualizar plan (no afecta suscripciones ya creadas: esas
   quedaron con su propia "foto" del plan al momento de suscribirse)
======================================================= */
export const actualizarPlanSuscripcion = async (req, res) => {
  try {
    const { id } = req.params;
    const empresaId = req.usuario.empresaId;

    const plan = await PlanSuscripcion.findOne({ _id: id, empresa: empresaId });
    if (!plan) {
      return res.status(404).json({ message: "Plan no encontrado" });
    }

    const datosFusionados = { ...plan.toObject(), ...req.body };
    const errorValidacion = validarDatosPlan(datosFusionados);
    if (errorValidacion) {
      return res.status(400).json({ message: errorValidacion });
    }

    for (const campo of camposEditables) {
      if (req.body[campo] !== undefined) plan[campo] = req.body[campo];
    }

    await plan.save();

    return res.json({ message: "Plan actualizado correctamente", plan });
  } catch (error) {
    console.error("Error al actualizar plan de suscripción:", error);
    return res
      .status(500)
      .json({ message: "Error interno al actualizar el plan" });
  }
};

/* =======================================================
   🟣 Activar / desactivar plan
======================================================= */
export const toggleActivoPlanSuscripcion = async (req, res) => {
  try {
    const { id } = req.params;
    const empresaId = req.usuario.empresaId;

    const plan = await PlanSuscripcion.findOne({ _id: id, empresa: empresaId });
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
    console.error("Error al cambiar estado del plan de suscripción:", error);
    return res
      .status(500)
      .json({ message: "Error interno al cambiar el estado del plan" });
  }
};

/* =======================================================
   🔴 Eliminar plan (o desactivar si ya tiene suscriptores, para no
   perder el historial de quién se suscribió a qué)
======================================================= */
export const eliminarPlanSuscripcion = async (req, res) => {
  try {
    const { id } = req.params;
    const empresaId = req.usuario.empresaId;

    const plan = await PlanSuscripcion.findOne({ _id: id, empresa: empresaId });
    if (!plan) {
      return res.status(404).json({ message: "Plan no encontrado" });
    }

    const tieneSuscriptores = await Suscripcion.exists({ plan: id });
    if (tieneSuscriptores) {
      plan.activo = false;
      await plan.save();
      return res.json({
        message:
          "El plan ya tiene clientes suscritos, así que se desactivó en vez de eliminarse (para no perder el historial)",
        plan,
      });
    }

    await PlanSuscripcion.deleteOne({ _id: id });

    return res.json({ message: "Plan eliminado correctamente" });
  } catch (error) {
    console.error("Error al eliminar plan de suscripción:", error);
    return res
      .status(500)
      .json({ message: "Error interno al eliminar el plan" });
  }
};
