import MembresiaClase from "../models/membresiaClase.model.js";
import PlanMembresiaClase from "../models/planMembresiaClase.model.js";
import Usuario from "../models/usuario.model.js";
import Empresa from "../models/empresa.model.js";
import { contarClasesUsadasMembresia } from "../helpers/contarClasesUsadasMembresia.js";
import { sendMembresiaActivaEmail } from "./mailController.js";

/* =======================================================
   🟢 Crear mensualidad a partir de un plan (mismo flujo manual que usan
   hoy con las suscripciones de barbería: el admin la registra a mano
   después de que el cliente transfiere)
======================================================= */
export const crearMembresia = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const { clienteId, planId } = req.body;

    if (!clienteId || !planId) {
      return res.status(400).json({ message: "Debes indicar el cliente y el plan" });
    }

    const cliente = await Usuario.findOne({ _id: clienteId, empresa: empresaId });
    if (!cliente) {
      return res.status(404).json({ message: "Cliente no encontrado en esta empresa" });
    }

    const plan = await PlanMembresiaClase.findOne({
      _id: planId,
      empresa: empresaId,
      activo: true,
    });
    if (!plan) {
      return res.status(404).json({ message: "Plan no encontrado o inactivo" });
    }

    const membresiaActiva = await MembresiaClase.findOne({
      empresa: empresaId,
      cliente: clienteId,
      activa: true,
    });
    if (membresiaActiva) {
      return res
        .status(409)
        .json({ message: "El cliente ya tiene una mensualidad activa" });
    }

    const fechaInicio = new Date();
    const fechaFin = new Date();
    fechaFin.setDate(fechaFin.getDate() + plan.duracionDias);

    const membresia = await MembresiaClase.create({
      empresa: empresaId,
      cliente: clienteId,
      plan: plan._id,
      // snapshot: si después el admin edita o borra el plan, esta mensualidad no cambia
      nombrePlan: plan.nombre,
      clasesIncluidas: plan.clasesIncluidas,
      precio: plan.precio,
      activa: true,
      fechaInicio,
      fechaFin,
    });

    // 📧 Correo de bienvenida (no bloquea la respuesta si falla)
    try {
      const empresa = await Empresa.findById(empresaId).select("nombre slug");
      if (cliente.email && empresa) {
        await sendMembresiaActivaEmail(cliente.email, {
          nombreCliente: cliente.nombre,
          nombreEmpresa: empresa.nombre,
          nombrePlan: membresia.nombrePlan,
          clasesIncluidas: membresia.clasesIncluidas,
          precio: membresia.precio,
          fechaInicio: membresia.fechaInicio,
          fechaFin: membresia.fechaFin,
          linkMiPlan: `https://www.agendafonfach.cl/${empresa.slug}/admin/mi-plan`,
        });
      }
    } catch (mailError) {
      console.error("Error al enviar correo de bienvenida de membresía:", mailError);
    }

    return res
      .status(201)
      .json({ message: "Mensualidad registrada correctamente", membresia });
  } catch (error) {
    console.error("Error al crear membresía de clases:", error);
    return res
      .status(500)
      .json({ message: "Error interno al crear la mensualidad" });
  }
};

/* =======================================================
   🔴 Cancelar mensualidad
======================================================= */
export const cancelarMembresia = async (req, res) => {
  try {
    const { id } = req.params;
    const empresaId = req.usuario.empresaId;

    const membresia = await MembresiaClase.findOne({
      _id: id,
      empresa: empresaId,
      activa: true,
    });
    if (!membresia) {
      return res.status(404).json({ message: "No se encontró una mensualidad activa" });
    }

    membresia.activa = false;
    membresia.historial = true;
    membresia.fechaFin = new Date();
    await membresia.save();

    return res.json({ message: "Mensualidad cancelada correctamente", membresia });
  } catch (error) {
    console.error("Error al cancelar membresía de clases:", error);
    return res
      .status(500)
      .json({ message: "Error interno al cancelar la mensualidad" });
  }
};

/* =======================================================
   🟡 Estado de mensualidad de un cliente (incluye clases usadas/restantes,
   porque el plan NO es ilimitado)
======================================================= */
export const estadoMembresiaCliente = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const esAdmin = !!req.usuario.esAdmin;
    // Un cliente solo puede consultar su propia mensualidad; un admin puede
    // consultar la de cualquier cliente de su empresa pasando el id en la URL.
    const clienteId = esAdmin ? req.params.clienteId : req.usuario.id;

    const membresia = await MembresiaClase.findOne({
      empresa: empresaId,
      cliente: clienteId,
      activa: true,
    });

    if (!membresia) {
      return res.json({ activa: false });
    }

    if (membresia.fechaFin < new Date()) {
      membresia.activa = false;
      membresia.historial = true;
      await membresia.save();
      return res.json({ activa: false, msg: "Mensualidad vencida" });
    }

    const clasesUsadas = await contarClasesUsadasMembresia(membresia);

    return res.json({
      activa: true,
      nombrePlan: membresia.nombrePlan,
      fechaInicio: membresia.fechaInicio,
      fechaFin: membresia.fechaFin,
      clasesIncluidas: membresia.clasesIncluidas,
      clasesUsadas,
      clasesRestantes: Math.max(membresia.clasesIncluidas - clasesUsadas, 0),
    });
  } catch (error) {
    console.error("Error al obtener estado de membresía:", error);
    return res
      .status(500)
      .json({ message: "Error interno al obtener el estado de la mensualidad" });
  }
};

/* =======================================================
   🟣 Listar mensualidades de la empresa (con clases usadas/restantes)
======================================================= */
export const listarMembresias = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const { activas } = req.query;

    const filtro = { empresa: empresaId };
    if (activas === "true") {
      filtro.activa = true;
      filtro.fechaFin = { $gte: new Date() };
    }

    const membresias = await MembresiaClase.find(filtro)
      .populate("cliente", "nombre apellido email telefono")
      .sort({ createdAt: -1 });

    const membresiasConUso = await Promise.all(
      membresias.map(async (m) => {
        const clasesUsadas = await contarClasesUsadasMembresia(m);
        return {
          ...m.toObject(),
          clasesUsadas,
          clasesRestantes: Math.max(m.clasesIncluidas - clasesUsadas, 0),
        };
      }),
    );

    return res.json({ membresias: membresiasConUso });
  } catch (error) {
    console.error("Error al listar membresías de clases:", error);
    return res
      .status(500)
      .json({ message: "Error interno al listar las mensualidades" });
  }
};
