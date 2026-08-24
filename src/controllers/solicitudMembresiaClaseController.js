import cloudinary from "../config/cloudinary.js";
import SolicitudMembresiaClase from "../models/solicitudMembresiaClase.model.js";
import MembresiaClase from "../models/membresiaClase.model.js";
import PlanMembresiaClase from "../models/planMembresiaClase.model.js";
import Usuario from "../models/usuario.model.js";
import Empresa from "../models/empresa.model.js";
import { esRutValido, formatearRut } from "../helpers/validarRut.js";
import {
  sendMembresiaActivaEmail,
  sendSolicitudMembresiaRechazadaEmail,
  sendSolicitudMembresiaRecibidaEmail,
} from "./mailController.js";

const METODOS_VALIDOS = ["transferencia", "efectivo", "whatsapp"];

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
   Núcleo común de creación de una solicitud, reutilizado tanto por el
   cliente logueado (crearSolicitud) como por el checkout público sin cuenta
   (crearSolicitudPublica): valida el plan y el método, revisa antiduplicados
   (ni una membresía activa, ni otra solicitud pendiente) y crea el registro.
   Así ambos caminos quedan con exactamente las mismas reglas.
======================================================= */
const crearSolicitudCore = async ({ empresaId, clienteId, planId, metodo, comprobante }) => {
  if (!planId || !metodo) {
    return { error: { status: 400, message: "Debes indicar el plan y el método de pago" } };
  }

  if (!METODOS_VALIDOS.includes(metodo)) {
    return { error: { status: 400, message: "Método de pago inválido" } };
  }

  if (metodo === "transferencia" && !comprobante) {
    return {
      error: { status: 400, message: "Debes subir el comprobante de la transferencia" },
    };
  }

  const plan = await PlanMembresiaClase.findOne({
    _id: planId,
    empresa: empresaId,
    activo: true,
  });
  if (!plan) {
    return { error: { status: 404, message: "Plan no encontrado o inactivo" } };
  }

  // Antiduplicados: ni una membresía ya activa, ni otra solicitud esperando
  // revisión. Antes esto solo se chequeaba al aprobar; se adelanta acá para
  // avisarle al cliente de inmediato en vez de dejarlo esperando una
  // solicitud que igual iba a rechazarse.
  const membresiaActiva = await MembresiaClase.findOne({
    empresa: empresaId,
    cliente: clienteId,
    activa: true,
  });
  if (membresiaActiva) {
    return { error: { status: 409, message: "Ya tienes una mensualidad activa" } };
  }

  const solicitudPendiente = await SolicitudMembresiaClase.findOne({
    empresa: empresaId,
    cliente: clienteId,
    estado: "pendiente",
  });
  if (solicitudPendiente) {
    return {
      error: {
        status: 409,
        message:
          "Ya tienes una solicitud pendiente de revisión. Espera a que el gimnasio la confirme.",
      },
    };
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
    comprobante: comprobante || { url: "", publicId: "" },
  });

  return { solicitud };
};

/* =======================================================
   🟢 Cliente logueado: crear una solicitud de mensualidad
======================================================= */
export const crearSolicitud = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const clienteId = req.usuario.id;
    const { planId, metodo } = req.body;

    let comprobante = null;
    if (metodo === "transferencia") {
      if (!req.file) {
        return res.status(400).json({
          message: "Debes subir el comprobante de la transferencia",
        });
      }
      try {
        const resultado = await subirComprobante(req.file.buffer);
        comprobante = { url: resultado.secure_url, publicId: resultado.public_id };
      } catch (error) {
        console.error("Error al subir comprobante a Cloudinary:", error);
        return res
          .status(500)
          .json({ message: "No se pudo subir el comprobante, intenta de nuevo" });
      }
    }

    const resultado = await crearSolicitudCore({ empresaId, clienteId, planId, metodo, comprobante });
    if (resultado.error) {
      return res.status(resultado.error.status).json({ message: resultado.error.message });
    }

    return res.status(201).json({
      message: "Solicitud enviada correctamente, el gimnasio la revisará pronto",
      solicitud: resultado.solicitud,
    });
  } catch (error) {
    console.error("Error al crear solicitud de membresía:", error);
    return res
      .status(500)
      .json({ message: "Error interno al crear la solicitud" });
  }
};

/* =======================================================
   🌐 Checkout público (sin login): el visitante elige un plan, ingresa sus
   datos y método de pago desde el landing. NO activa nada por sí sola — cae
   en el mismo core de arriba, así que queda "pendiente" igual que si lo
   hubiera pedido un cliente logueado, y el admin la revisa igual.

   Identidad: se busca/crea al cliente por RUT (mismo patrón que ya usan las
   reservas de invitado) — si el RUT ya es una cuenta real, se reutiliza esa
   identidad sin pisar sus datos; si no existe, se crea un registro
   "invitado" sin contraseña que después puede reclamar su cuenta (mismo
   mecanismo de siempre vía el correo de bienvenida/verificación).
======================================================= */
export const crearSolicitudPublica = async (req, res) => {
  try {
    const { slug } = req.params;
    const { nombre, apellido, telefono, planId, metodo } = req.body;
    const rutIngresado = req.body.rut;
    const email = String(req.body.email || "").toLowerCase().trim();

    if (
      !nombre?.trim() ||
      !apellido?.trim() ||
      !rutIngresado ||
      !telefono?.trim() ||
      !email ||
      !planId ||
      !metodo
    ) {
      return res.status(400).json({ message: "Completa todos los datos para contratar tu plan" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "El correo ingresado no es válido" });
    }
    if (!esRutValido(rutIngresado)) {
      return res.status(400).json({ message: "El RUT ingresado no es válido" });
    }
    const rut = formatearRut(rutIngresado);

    const empresa = await Empresa.findOne({ slug });
    if (!empresa || !empresa.modulos?.clasesGrupales) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    let comprobante = null;
    if (metodo === "transferencia") {
      if (!req.file) {
        return res.status(400).json({
          message: "Debes subir el comprobante de la transferencia",
        });
      }
      try {
        const resultado = await subirComprobante(req.file.buffer);
        comprobante = { url: resultado.secure_url, publicId: resultado.public_id };
      } catch (error) {
        console.error("Error al subir comprobante a Cloudinary:", error);
        return res
          .status(500)
          .json({ message: "No se pudo subir el comprobante, intenta de nuevo" });
      }
    }

    // Si mandó comprobante por "whatsapp" igual lo guardamos (por si lo
    // adjuntó desde el formulario en vez de mandarlo por chat); si no, el
    // admin lo verá pendiente y lo confirmará cuando le llegue por WhatsApp.

    let cliente = await Usuario.findOne({ empresa: empresa._id, rut });
    if (!cliente) {
      cliente = await Usuario.create({
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        rut,
        email,
        telefono: telefono.trim(),
        rol: "invitado",
        empresa: empresa._id,
      });
    } else if (cliente.rol === "invitado") {
      // Invitado que ya había pedido algo antes: solo actualizamos contacto.
      cliente.nombre = nombre.trim();
      cliente.apellido = apellido.trim();
      cliente.email = email;
      cliente.telefono = telefono.trim();
      await cliente.save();
    }
    // Si ya es una cuenta real (cliente/admin/barbero) se reutiliza tal cual,
    // sin tocar sus datos — igual que en las reservas de invitado.

    const resultado = await crearSolicitudCore({
      empresaId: empresa._id,
      clienteId: cliente._id,
      planId,
      metodo,
      comprobante,
    });
    if (resultado.error) {
      return res.status(resultado.error.status).json({ message: resultado.error.message });
    }

    try {
      if (cliente.email) {
        await sendSolicitudMembresiaRecibidaEmail(cliente.email, {
          nombreCliente: cliente.nombre,
          nombreEmpresa: empresa.nombre,
          nombrePlan: resultado.solicitud.nombrePlan,
          metodo,
        });
      }
    } catch (mailError) {
      console.error("Error al enviar correo de solicitud recibida:", mailError);
    }

    return res.status(201).json({
      message: "¡Listo! Recibimos tu solicitud, el gimnasio la revisará y activará tu plan pronto.",
      solicitud: resultado.solicitud,
    });
  } catch (error) {
    console.error("Error al crear solicitud pública de membresía:", error);
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
   🟡 Admin: listar solicitudes (panel de pagos). Acepta ?estado= para
   filtrar por pendiente/aprobada/rechazada, o "todas"/vacío para verlas
   todas — esto es lo que alimenta el panel de pagos del admin.
======================================================= */
export const listarSolicitudesAdmin = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const { estado } = req.query;

    const filtro = { empresa: empresaId };
    if (estado && estado !== "todas") filtro.estado = estado;

    const solicitudes = await SolicitudMembresiaClase.find(filtro)
      .populate("cliente", "nombre apellido email telefono rut")
      .sort({ createdAt: -1 });

    return res.json({ solicitudes });
  } catch (error) {
    console.error("Error al obtener solicitudes:", error);
    return res
      .status(500)
      .json({ message: "Error interno al obtener las solicitudes" });
  }
};

// Alias retrocompatible: la ruta/frontend existente sigue pidiendo
// "/pendientes" tal cual, así que la dejamos funcionando igual que antes en
// vez de romperla.
export const getSolicitudesPendientes = (req, res) => {
  req.query.estado = "pendiente";
  return listarSolicitudesAdmin(req, res);
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
    }).populate("cliente", "nombre email");
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

    // 📧 Notificar al cliente (no bloquea la respuesta si falla)
    try {
      const empresa = await Empresa.findById(empresaId).select("nombre");
      if (solicitud.cliente?.email && empresa) {
        await sendSolicitudMembresiaRechazadaEmail(solicitud.cliente.email, {
          nombreCliente: solicitud.cliente.nombre,
          nombreEmpresa: empresa.nombre,
          nombrePlan: solicitud.nombrePlan,
          motivo: solicitud.motivoRechazo,
        });
      }
    } catch (mailError) {
      console.error("Error al enviar correo de rechazo de solicitud:", mailError);
    }

    return res.json({ message: "Solicitud rechazada", solicitud });
  } catch (error) {
    console.error("Error al rechazar solicitud de membresía:", error);
    return res
      .status(500)
      .json({ message: "Error interno al rechazar la solicitud" });
  }
};
