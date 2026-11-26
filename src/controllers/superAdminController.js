import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { TOKEN_SECRET } from "../config.js";
import Empresa from "../models/empresa.model.js";
import PagoEmpresa from "../models/pagoEmpresa.model.js";
import Usuario from "../models/usuario.model.js";
import { construirCambiosEmpresa, mesAnioCobro } from "../utils/edicionEmpresa.js";
import { aplicarPagoEmpresa, ErrorPago } from "../services/pagosEmpresa.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { sendRecordatorioPagoEmail } from "./mailController.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const ESTADOS_EMPRESA = ["activo", "inactivo"];
const ESTADOS_SUSCRIPCION = ["trial", "activo", "suspendido", "cancelado"];

/* =====================================================
   LOGIN — credenciales en .env (SUPERADMIN_EMAIL /
   SUPERADMIN_PASSWORD_HASH), no en la base de datos: este panel es solo
   para Hans, no hace falta (ni conviene) modelarlo como un Usuario más.
===================================================== */
export const loginSuperAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email y contraseña requeridos" });
    }

    const emailEsperado = (process.env.SUPERADMIN_EMAIL || "").trim().toLowerCase();
    const hashEsperado = process.env.SUPERADMIN_PASSWORD_HASH;

    if (!emailEsperado || !hashEsperado) {
      console.error(
        "SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD_HASH no están configurados en .env",
      );
      return res.status(500).json({ message: "Panel no configurado en el servidor" });
    }

    if (email.trim().toLowerCase() !== emailEsperado) {
      return res.status(400).json({ message: "Usuario y/o contraseña incorrecta" });
    }

    const passwordValida = await bcrypt.compare(password, hashEsperado);
    if (!passwordValida) {
      return res.status(400).json({ message: "Usuario y/o contraseña incorrecta" });
    }

    const token = jwt.sign({ superadmin: true, email: emailEsperado }, TOKEN_SECRET, {
      expiresIn: "12h",
    });

    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("superadminToken", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 12 * 60 * 60 * 1000,
      path: "/",
    });

    return res.status(200).json({ message: "Login exitoso", token });
  } catch (error) {
    console.error("Error en login superadmin:", error);
    return res.status(500).json({ message: "Error en el servidor" });
  }
};

export const logoutSuperAdmin = (req, res) => {
  res.clearCookie("superadminToken", { path: "/" });
  return res.json({ message: "Sesión cerrada" });
};

/* =====================================================
   LISTAR EMPRESAS
===================================================== */
export const listarEmpresas = async (req, res) => {
  try {
    const empresas = await Empresa.find(
      {},
      "nombre slug correo telefono logo ciudad rubro tipo estado estadoSuscripcion cuotaMensual fechaPago ultimoPago proximoPago suspendidaDesde motivoSuspension notasSuperAdmin trial creadoEn",
    )
      .sort({ nombre: 1 })
      .lean();

    return res.json({ empresas });
  } catch (error) {
    console.error("Error al listar empresas (superadmin):", error);
    return res.status(500).json({ message: "Error al listar empresas" });
  }
};

/* =====================================================
   ACTIVAR / DESACTIVAR (soft — nunca borra nada)
===================================================== */
export const actualizarEstadoEmpresa = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!ESTADOS_EMPRESA.includes(estado)) {
      return res.status(400).json({ message: "Estado inválido" });
    }

    const empresa = await Empresa.findByIdAndUpdate(
      id,
      { estado },
      { new: true, runValidators: true },
    );
    if (!empresa) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    return res.json({ message: "Estado actualizado", empresa });
  } catch (error) {
    console.error("Error al actualizar estado de empresa:", error);
    return res.status(500).json({ message: "Error al actualizar el estado" });
  }
};

/* =====================================================
   SUSPENDER / REACTIVAR POR PAGO
===================================================== */
export const actualizarEstadoSuscripcion = async (req, res) => {
  try {
    const { id } = req.params;
    const { estadoSuscripcion, motivoSuspension } = req.body;

    if (!ESTADOS_SUSCRIPCION.includes(estadoSuscripcion)) {
      return res.status(400).json({ message: "Estado de suscripción inválido" });
    }

    const bloqueando = ["suspendido", "cancelado"].includes(estadoSuscripcion);

    const cambios = {
      estadoSuscripcion,
      motivoSuspension: bloqueando ? motivoSuspension || "" : "",
      suspendidaDesde: bloqueando ? new Date() : null,
    };

    const empresa = await Empresa.findByIdAndUpdate(id, cambios, {
      new: true,
      runValidators: true,
    });
    if (!empresa) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    return res.json({ message: "Estado de suscripción actualizado", empresa });
  } catch (error) {
    console.error("Error al actualizar estadoSuscripcion:", error);
    return res.status(500).json({ message: "Error al actualizar la suscripción" });
  }
};

/* =====================================================
   CONFIGURAR CUÁNTO SE LE COBRA A LA EMPRESA
===================================================== */
export const actualizarCobro = async (req, res) => {
  try {
    const { id } = req.params;
    const { cuotaMensual, fechaPago } = req.body;

    const cambios = {};
    if (cuotaMensual !== undefined) {
      const monto = Number(cuotaMensual);
      if (Number.isNaN(monto) || monto < 0) {
        return res.status(400).json({ message: "cuotaMensual inválida" });
      }
      cambios.cuotaMensual = monto;
    }
    if (fechaPago !== undefined) {
      const dia = Number(fechaPago);
      if (Number.isNaN(dia) || dia < 1 || dia > 31) {
        return res.status(400).json({ message: "fechaPago inválida (día del mes 1-31)" });
      }
      cambios.fechaPago = dia;
    }

    const empresa = await Empresa.findByIdAndUpdate(id, cambios, {
      new: true,
      runValidators: true,
    });
    if (!empresa) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    return res.json({ message: "Cobro actualizado", empresa });
  } catch (error) {
    console.error("Error al actualizar cobro de empresa:", error);
    return res.status(500).json({ message: "Error al actualizar el cobro" });
  }
};

/* =====================================================
   REGISTRAR UN PAGO RECIBIDO (transferencia manual)
===================================================== */
export const registrarPago = async (req, res) => {
  try {
    const { id } = req.params;
    const { monto, notas, enviarCorreo = true } = req.body;
    // Misma lógica que usa el pago online (services/pagosEmpresa.js)
    const { empresa, correo, proximoCobro } = await aplicarPagoEmpresa(id, { monto, notas, enviarCorreo });
    return res.json({ message: "Pago registrado", empresa, correo, proximoCobro });
  } catch (error) {
    if (error instanceof ErrorPago) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("Error al registrar pago:", error);
    return res.status(500).json({ message: "Error al registrar el pago" });
  }
};

/* =====================================================
   AVISO MANUAL: "TU PLAN VENCE HOY"
   Mismo correo que manda el cron automático (tipo vencimiento_hoy), pero
   a pedido desde el panel. Sirve, por ejemplo, para negocios que todavía
   no tienen su cobro cargado en PagoEmpresa y por eso el cron no los ve.
===================================================== */
export const enviarRecordatorioVencimiento = async (req, res) => {
  try {
    const { id } = req.params;

    const empresa = await Empresa.findById(id);
    if (!empresa) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }
    if (!empresa.correo) {
      return res.status(400).json({
        message: `${empresa.nombre} no tiene un correo registrado, no hay a dónde enviarlo`,
      });
    }

    const resultado = await sendRecordatorioPagoEmail(empresa, {
      tipo: "vencimiento_hoy",
    });
    if (resultado?.error) {
      console.error("Resend rechazó el aviso de vencimiento:", resultado.error);
      return res.status(502).json({ message: "El proveedor de correo rechazó el envío" });
    }

    // Si este negocio tiene un cobro pendiente que vence HOY, se marca el
    // aviso de "vence hoy" como ya enviado para que el cron de las 9:00 no
    // lo repita. Si el cobro vence otro día, no se toca (el cron seguirá
    // mandando sus avisos normales ese día).
    try {
      const hoy = dayjs().tz("America/Santiago").startOf("day");
      const pendientes = await PagoEmpresa.find({
        empresa: empresa._id,
        estado: { $in: ["pendiente", "atrasado"] },
      });
      for (const pago of pendientes) {
        const vence = dayjs(pago.fechaVencimiento).tz("America/Santiago").startOf("day");
        if (vence.diff(hoy, "day") === 0 && !pago.notificaciones?.diaVencimiento) {
          pago.notificaciones.diaVencimiento = true;
          pago.markModified("notificaciones");
          await pago.save();
        }
      }
    } catch (err) {
      console.error("No se pudo marcar el aviso en PagoEmpresa:", err.message);
    }

    return res.json({
      message: `Aviso enviado a ${empresa.correo}`,
      destino: empresa.correo,
    });
  } catch (error) {
    console.error("Error al enviar aviso de vencimiento:", error);
    return res.status(500).json({ message: "No se pudo enviar el aviso" });
  }
};

/* =====================================================
   RESUMEN DE GANANCIAS
===================================================== */
export const resumenGanancias = async (req, res) => {
  try {
    const empresas = await Empresa.find(
      {},
      "nombre estado estadoSuscripcion cuotaMensual historialPagos",
    ).lean();

    const empresasActivas = empresas.filter((e) => e.estado === "activo");
    const empresasSuspendidas = empresas.filter((e) =>
      ["suspendido", "cancelado"].includes(e.estadoSuscripcion),
    );

    // Ingreso mensual recurrente teórico: lo que debería entrar cada mes si
    // todas las empresas activas y al día pagan su cuota.
    const ingresoMensualRecurrente = empresasActivas
      .filter((e) => !["suspendido", "cancelado"].includes(e.estadoSuscripcion))
      .reduce((acc, e) => acc + (e.cuotaMensual || 0), 0);

    // Ingreso REAL recibido por mes, en base a los pagos efectivamente
    // registrados (historialPagos) — últimos 12 meses.
    const porMes = new Map(); // "YYYY-MM" -> total
    for (const empresa of empresas) {
      for (const pago of empresa.historialPagos || []) {
        const fecha = new Date(pago.fecha);
        const clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
        porMes.set(clave, (porMes.get(clave) || 0) + (pago.monto || 0));
      }
    }
    const historialMensual = [...porMes.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .slice(-12)
      .map(([mes, total]) => ({ mes, total }));

    const totalRecibidoHistorico = [...porMes.values()].reduce((a, b) => a + b, 0);

    return res.json({
      empresasTotal: empresas.length,
      empresasActivas: empresasActivas.length,
      empresasSuspendidas: empresasSuspendidas.length,
      ingresoMensualRecurrente,
      totalRecibidoHistorico,
      historialMensual,
    });
  } catch (error) {
    console.error("Error al calcular ganancias (superadmin):", error);
    return res.status(500).json({ message: "Error al calcular las ganancias" });
  }
};

/* =====================================================
   EDITAR NEGOCIO (modal "Editar negocio" del panel)
   GET  /empresas/:id → ficha completa (datos, plan, módulos, admins,
                        cobros pendientes y últimos pagos)
   PATCH /empresas/:id → guarda los cambios (lista blanca en
                        utils/edicionEmpresa.js)
===================================================== */
const CAMPOS_DETALLE =
  "nombre slug rubro tipo correo telefono direccion ciudad rutEmpresa logo estado estadoSuscripcion plan trial cuotaMensual fechaPago ultimoPago proximoPago suspendidaDesde motivoSuspension modulos moduloProductos permiteSuscripcion directorioVisible notasSuperAdmin pagoAutomatico creadoEn";

const fichaEmpresa = async (id) => {
  const empresa = await Empresa.findById(id)
    .select(`${CAMPOS_DETALLE} historialPagos`)
    .lean();
  if (!empresa) return null;

  const [admins, profesionales, clientes, cobrosAbiertos] = await Promise.all([
    Usuario.find({ empresa: id, esAdmin: true }).select("nombre apellido email telefono").lean(),
    Usuario.countDocuments({ empresa: id, rol: "barbero" }),
    Usuario.countDocuments({ empresa: id, rol: "cliente" }),
    PagoEmpresa.find({ empresa: id, estado: { $in: ["pendiente", "atrasado"] } })
      .select("fechaVencimiento monto estado")
      .sort({ fechaVencimiento: 1 })
      .lean(),
  ]);

  const historialPagos = [...(empresa.historialPagos || [])]
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, 12);

  return {
    ...empresa,
    historialPagos,
    admins,
    totales: { profesionales, clientes },
    cobrosAbiertos,
  };
};

export const detalleEmpresa = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Empresa no encontrada" });
    const ficha = await fichaEmpresa(req.params.id);
    if (!ficha) return res.status(404).json({ message: "Empresa no encontrada" });
    return res.json({ empresa: ficha });
  } catch (error) {
    console.error("Error al cargar la ficha de la empresa (superadmin):", error);
    return res.status(500).json({ message: "No se pudo cargar el negocio" });
  }
};

/**
 * Deja el cobro pendiente (PagoEmpresa, el que lee el cron de avisos por
 * correo) en la nueva fecha de próximo pago:
 *  - "mover": el cobro pendiente más antiguo pasa a esa fecha, con los avisos
 *    en cero; si no hay ninguno, se crea.
 *  - "cancelar": se borró el próximo pago → los cobros pendientes se anulan
 *    para que el cron no avise ni suspenda.
 * Es "best effort": si falla, lo editado ya quedó guardado.
 */
const sincronizarCobroPendiente = async (empresa, { accion, fecha }) => {
  const abiertos = await PagoEmpresa.find({
    empresa: empresa._id,
    estado: { $in: ["pendiente", "atrasado"] },
  }).sort({ fechaVencimiento: 1 });

  if (accion === "cancelar") {
    for (const p of abiertos) {
      p.estado = "cancelado";
      p.observacion = "Anulado desde el panel (se quitó el próximo pago)";
      await p.save();
    }
    return { accion: "cancelados", cantidad: abiertos.length };
  }

  const { mes, anio } = mesAnioCobro(fecha);
  const avisosEnCero = {
    diasAntes5: false,
    diasAntes2: false,
    diasAntes1: false,
    diaVencimiento: false,
    diasDespues3: false,
  };

  const [cobro] = abiertos;
  if (cobro) {
    cobro.fechaVencimiento = fecha;
    cobro.estado = "pendiente";
    cobro.mes = mes;
    cobro.anio = anio;
    if (empresa.cuotaMensual) cobro.monto = empresa.cuotaMensual;
    cobro.notificaciones = avisosEnCero;
    cobro.markModified("notificaciones");
    await cobro.save();
    return { accion: "movido", fecha };
  }

  await PagoEmpresa.create({
    empresa: empresa._id,
    mes,
    anio,
    monto: empresa.cuotaMensual || 0,
    estado: "pendiente",
    fechaVencimiento: fecha,
    metodoPago: "transferencia",
    observacion: "Cobro creado al editar el próximo pago desde el panel",
    notificaciones: avisosEnCero,
  });
  return { accion: "creado", fecha };
};

export const editarEmpresa = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: "Empresa no encontrada" });
    const actual = await Empresa.findById(id)
      .select("estadoSuscripcion trial fechaPago proximoPago")
      .lean();
    if (!actual) return res.status(404).json({ message: "Empresa no encontrada" });

    const { set, errores, cobro } = construirCambiosEmpresa(req.body || {}, actual, {
      rubrosValidos: Empresa.schema.path("rubro").enumValues,
    });
    if (errores.length) {
      return res.status(400).json({ message: errores.join(". "), errores });
    }
    if (!Object.keys(set).length) {
      return res.status(400).json({ message: "No hay cambios para guardar" });
    }

    const empresa = await Empresa.findByIdAndUpdate(
      id,
      { $set: set },
      { new: true, runValidators: true },
    ).lean();

    let resultadoCobro = null;
    if (cobro) {
      try {
        resultadoCobro = await sincronizarCobroPendiente(empresa, cobro);
      } catch (err) {
        console.error("No se pudo actualizar el cobro pendiente (PagoEmpresa):", err.message);
        resultadoCobro = { accion: "error" };
      }
    }

    return res.json({
      message: "Negocio actualizado",
      empresa: await fichaEmpresa(id),
      cobro: resultadoCobro,
    });
  } catch (error) {
    console.error("Error al editar empresa (superadmin):", error);
    if (error?.name === "ValidationError") {
      return res.status(400).json({ message: "Revisa los datos: alguno no es válido" });
    }
    return res.status(500).json({ message: "No se pudo guardar el negocio" });
  }
};
