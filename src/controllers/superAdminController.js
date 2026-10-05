import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { TOKEN_SECRET } from "../config.js";
import Empresa from "../models/empresa.model.js";
import PagoEmpresa from "../models/pagoEmpresa.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import {
  sendPagoAcreditadoEmail,
  sendRecordatorioPagoEmail,
} from "./mailController.js";

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
      "nombre slug correo rubro tipo estado estadoSuscripcion cuotaMensual fechaPago ultimoPago proximoPago suspendidaDesde motivoSuspension trial creadoEn",
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

    const empresa = await Empresa.findById(id);
    if (!empresa) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    const montoFinal = monto !== undefined ? Number(monto) : empresa.cuotaMensual;
    if (!montoFinal || Number.isNaN(montoFinal) || montoFinal <= 0) {
      return res.status(400).json({ message: "Monto de pago inválido" });
    }

    const ahora = new Date();
    empresa.historialPagos.push({ fecha: ahora, monto: montoFinal, notas: notas || "" });
    empresa.ultimoPago = ahora;

    // Sugerencia de próximo pago: mismo día del mes (fechaPago) del mes
    // siguiente si está configurado, si no, +30 días desde hoy. Es editable
    // después a mano si hace falta (actualizarCobro no toca proximoPago, así
    // que si Hans quiere una fecha distinta la puede corregir aparte).
    const proximo = new Date(ahora);
    if (empresa.fechaPago) {
      proximo.setMonth(proximo.getMonth() + 1);
      proximo.setDate(Math.min(empresa.fechaPago, 28));
    } else {
      proximo.setDate(proximo.getDate() + 30);
    }
    empresa.proximoPago = proximo;

    // Si estaba suspendida por no pago, un pago registrado la reactiva sola.
    const estabaSuspendida = ["suspendido", "cancelado"].includes(
      empresa.estadoSuscripcion,
    );
    if (estabaSuspendida) {
      empresa.estadoSuscripcion = "activo";
      empresa.suspendidaDesde = null;
      empresa.motivoSuspension = "";
    }

    await empresa.save();

    // Si este negocio tenía un cobro pendiente en la colección PagoEmpresa
    // (el que usa el cron de correos automáticos), se cierra como pagado:
    // si no, el cron seguiría viéndolo como "atrasado" y lo suspendería a
    // los 3 días aunque ya hayas registrado el pago. Se cierra solo el más
    // antiguo (un pago salda una mensualidad). Es "best effort": el pago ya
    // quedó guardado arriba, así que si esto falla no se rompe nada.
    try {
      const pendiente = await PagoEmpresa.findOne({
        empresa: empresa._id,
        estado: { $in: ["pendiente", "atrasado"] },
      }).sort({ fechaVencimiento: 1 });

      if (pendiente) {
        pendiente.estado = "pagado";
        pendiente.fechaPago = ahora;
        if (!pendiente.monto) pendiente.monto = montoFinal;
        await pendiente.save();
      }
    } catch (err) {
      console.error("No se pudo cerrar el cobro pendiente (PagoEmpresa):", err.message);
    }

    // Correo de "pago acreditado" al negocio. Un fallo acá nunca debe
    // deshacer el pago: se informa en la respuesta para que el panel avise.
    let correo = { enviado: false, destino: null, motivo: "" };
    if (enviarCorreo !== false) {
      if (!empresa.correo) {
        correo.motivo = "El negocio no tiene un correo registrado";
      } else {
        try {
          const resultado = await sendPagoAcreditadoEmail(empresa, {
            monto: montoFinal,
            fechaPago: ahora,
            proximoPago: proximo,
            reactivada: estabaSuspendida,
          });
          if (resultado?.error) {
            throw new Error(resultado.error.message || "Error del proveedor de correo");
          }
          correo = { enviado: true, destino: empresa.correo, motivo: "" };
        } catch (err) {
          console.error("Error enviando correo de pago acreditado:", err.message);
          correo.motivo = "No se pudo enviar el correo";
        }
      }
    } else {
      correo.motivo = "Envío de correo desactivado para este pago";
    }

    return res.json({ message: "Pago registrado", empresa, correo });
  } catch (error) {
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
