import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { TOKEN_SECRET } from "../config.js";
import Empresa from "../models/empresa.model.js";

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
      "nombre slug rubro tipo estado estadoSuscripcion cuotaMensual fechaPago ultimoPago proximoPago suspendidaDesde motivoSuspension trial creadoEn",
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
    const { monto, notas } = req.body;

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
    if (["suspendido", "cancelado"].includes(empresa.estadoSuscripcion)) {
      empresa.estadoSuscripcion = "activo";
      empresa.suspendidaDesde = null;
      empresa.motivoSuspension = "";
    }

    await empresa.save();

    return res.json({ message: "Pago registrado", empresa });
  } catch (error) {
    console.error("Error al registrar pago:", error);
    return res.status(500).json({ message: "Error al registrar el pago" });
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
