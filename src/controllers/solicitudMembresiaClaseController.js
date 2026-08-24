import cloudinary from "../config/cloudinary.js";
import SolicitudMembresiaClase from "../models/solicitudMembresiaClase.model.js";
import MembresiaClase from "../models/membresiaClase.model.js";
import PlanMembresiaClase from "../models/planMembresiaClase.model.js";
import Empresa from "../models/empresa.model.js";
import { sendMembresiaActivaEmail } from "./mailController.js";

const METODOS_VALIDOS = ["transferencia", "efectivo"];

const subirComprobante = (buffer) =>
  new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: "comprobantesMembresia",
          resource_type: "auto", // admite imagen o PDF
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        },
      )
      .end(buffer);
  });

/* =======================================================
   🟢 Cliente: crear una solicitud de mensualidad (transferencia o efectivo)
======================================================= */
export const crearSolicitud = async (req, res) => {
  try {
    // El monto y el plan SIEMPRE salen de la BD, nunca de lo que mande el
    // cliente en el body — evita que alguien manipule el precio.
    const empresaId = req.usuario.empresaId;
    const clienteId = req.usuario.id;
    const { planId, metodo } = req.body;

    if (!planId || !metodo) {
      return res
        .status(400)
        .json({ message: "Debes indicar el plan y el método de pago" });
    }

    if (!METODOS_VALIDOS.includes(metodo)) {
      return res.status(400).json({ message: "Método de pago inválido" });
    }

    const plan = await PlanMembresiaClase.findOne({
      _id: planId,
      empresa: empresaId,
      activo: true,
    });
    if (!plan) {
      return res.status(404).json({ message: "Plan no encontrado o inactivo" });
    }

    // Evita spam: si ya tiene una solicitud pendiente, que espere a que se
    // resuelva antes de mandar otra.
    const solicitudPendiente = await SolicitudMembresiaClase.findOne({
      empresa: empresaId,
      cliente: clienteId,
      estado: "pendiente",
    });
    if (solicitudPendiente) {
      return res.status(409).json({
        message:
          "Ya tienes una solicitud pendiente de revisión. Espera a que el gimnasio la confirme.",
      });
    }

    let comprobante = { url: "", publicId: "" };

    if (metodo === "transferencia") {
      if (!req.file) {
        return res.status(400).json({
          message: "Debes subir el comprobante de la transferencia",
        });
      }
      try {
        const resultado = await subirComprobante(req.file.buffer);
        comprobante = {
          url: resultado.secure_url,
          publicId: resultado.public_id,
        };
      } catch (error) {
        console.error("Error al subir comprobante a Cloudinary:", error);
        return res
          .status(500)
          .json({ message: "No se pudo subir el comprobante, intenta de nuevo" });
      }
    }

    const solicitud = await SolicitudMembresiaClase.create({
      empresa: empresaId,
      cliente: clienteId,
      plan: plan._id,
      nombrePlan: plan.nombre,
      clasesIncluidas: plan.clasesIncluidas,
      duracionDias: plan.duracionDias,
      precio: plan.precio,
      metodo,
      comprobante,
    });

    return res.status(201).json({
      message: "Solicitud enviada correctamente, el gimnasio la revisará pronto",
      solicitud,
    });
  } catch (error) {
    console.error("Error al crear solicitud de membresía:", error);
    return res
      .status(500)
      .json({ message: "Error interno al crear la solicitud" });
  }
};

/* =======================================================
   🟡 Cliente: ver mis propias solicitudes (para saber el estado)
======================================================= */
export const getMisSolicitudes = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const clienteId = req.usuario.id;

    const solicitudes = await SolicitudMembresiaClase.find({
      empresa: empresaId,
      cliente: clienteId,
    })
      .sort({ createdAt: -1 })
      .limit(10);

    return res.json({ solicitudes });
  } catch (error) {
    console.error("Error al obtener mis solicitudes:", error);
    return res
      .status(500)
      .json({ message: "Error interno al obtener tus solicitudes" });
  }
};

/* =======================================================
   🟡 Admin: listar solicitudes pendientes de revisión
======================================================= */
export const getSolicitudesPendientes = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;

    const solicitudes = await SolicitudMembresiaClase.find({
      empresa: empresaId,
      estado: "pendiente",
    })
      .populate("cliente", "nombre apellido email telefono")
      .sort({ createdAt: -1 });

    return res.json({ solicitudes });
  } catch (error) {
    console.error("Error al obtener solicitudes pendientes:", error);
    return res
      .status(500)
      .json({ message: "Error interno al obtener las solicitudes" });
  }
};

/* =======================================================
   🟢 Admin: aprobar solicitud → crea la mensualidad real
======================================================= */
export const aprobarSolicitud = async (req, res) => {
  try {
    const { id } = req.params;
    const empresaId = req.usuario.empresaId;

    const solicitud = await SolicitudMembresiaClase.findOne({
      _id: id,
      empresa: empresaId,
      estado: "pendiente",
    }).populate("cliente", "nombre email");
    if (!solicitud) {
      return res
        .status(404)
        .json({ message: "Solicitud no encontrada o ya fue resuelta" });
    }

    const membresiaActiva = await MembresiaClase.findOne({
      empresa: empresaId,
      cliente: solicitud.cliente,
      activa: true,
    });
    if (membresiaActiva) {
      return res.status(409).json({
        message:
          "Este cliente ya tiene una mensualidad activa. Cancélala antes de aprobar una nueva.",
      });
    }

    const fechaInicio = new Date();
    const fechaFin = new Date();
    fechaFin.setDate(fechaFin.getDate() + solicitud.duracionDias);

    const membresia = await MembresiaClase.create({
      empresa: empresaId,
      cliente: solicitud.cliente._id,
      plan: solicitud.plan,
      nombrePlan: solicitud.nombrePlan,
      clasesIncluidas: solicitud.clasesIncluidas,
      precio: solicitud.precio,
      activa: true,
      fechaInicio,
      fechaFin,
    });

    solicitud.estado = "aprobada";
    solicitud.membresiaCreada = membresia._id;
    solicitud.resueltoPor = req.usuario.id;
    solicitud.fechaResolucion = new Date();
    await solicitud.save();

    // 📧 Correo de bienvenida (no bloquea la respuesta si falla)
    try {
      const empresa = await Empresa.findById(empresaId).select("nombre slug");
      if (solicitud.cliente?.email && empresa) {
        await sendMembresiaActivaEmail(solicitud.cliente.email, {
          nombreCliente: solicitud.cliente.nombre,
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

    return res.json({
      message: "Solicitud aprobada, la mensualidad quedó activa",
      solicitud,
      membresia,
    });
  } catch (error) {
    console.error("Error al aprobar solicitud de membresía:", error);
    return res
      .status(500)
      .json({ message: "Error interno al aprobar la solicitud" });
  }
};

/* =======================================================
   🔴 Admin: rechazar solicitud
======================================================= */
export const rechazarSolicitud = async (req, res) => {
  try {
    const { id } = req.params;
    const empresaId = req.usuario.empresaId;
    const { motivo } = req.body;

    const solicitud = await SolicitudMembresiaClase.findOne({
      _id: id,
      empresa: empresaId,
      estado: "pendiente",
    });
    if (!solicitud) {
      return res
        .status(404)
        .json({ message: "Solicitud no encontrada o ya fue resuelta" });
    }

    solicitud.estado = "rechazada";
    solicitud.motivoRechazo = motivo || "";
    solicitud.resueltoPor = req.usuario.id;
    solicitud.fechaResolucion = new Date();
    await solicitud.save();

    return res.json({ message: "Solicitud rechazada", solicitud });
  } catch (error) {
    console.error("Error al rechazar solicitud de membresía:", error);
    return res
      .status(500)
      .json({ message: "Error interno al rechazar la solicitud" });
  }
};
