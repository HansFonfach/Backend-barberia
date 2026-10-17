import mongoose from "mongoose";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import CodigoDescuento from "../models/codigoDescuento.model.js";
import Reserva from "../models/reserva.model.js";
import Servicio from "../models/servicio.model.js";
import empresaModel from "../models/empresa.model.js";
import { obtenerPrecioEspecial } from "../utils/precioEspecial.js";
import {
  ESTADOS_QUE_NO_CUENTAN,
  normalizarCodigo,
  estadoVigenciaCodigo,
  evaluarCodigoDescuento,
} from "../utils/codigoDescuento.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const ZONA = "America/Santiago";
const FORMATO_CODIGO = /^[A-Z0-9_-]{3,20}$/;

/* "YYYY-MM-DD" → Date a mediodía de Chile (null si viene vacío). Devuelve
   undefined si el formato es inválido. */
const parsearDia = (valor) => {
  if (valor === undefined) return undefined;
  if (valor === null || valor === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) return undefined;
  const d = dayjs.tz(`${valor} 12:00`, "YYYY-MM-DD HH:mm", ZONA);
  return d.isValid() ? d.toDate() : undefined;
};

/* número entero positivo, o null si viene vacío; undefined si es inválido */
const parsearEnteroOpcional = (valor) => {
  if (valor === undefined) return undefined;
  if (valor === null || valor === "") return null;
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
};

/* Valida y normaliza el cuerpo de crear/editar. `parcial` = edición. */
const validarCuerpo = async (body, empresaId, { parcial = false } = {}) => {
  const datos = {};

  if (!parcial || body.tipo !== undefined || body.valor !== undefined) {
    const tipo = body.tipo;
    const valor = Number(body.valor);
    if (!["porcentaje", "monto"].includes(tipo)) {
      return { error: "El tipo de descuento debe ser porcentaje o monto" };
    }
    if (!Number.isFinite(valor) || valor < 1) {
      return { error: "El valor del descuento debe ser mayor a 0" };
    }
    if (tipo === "porcentaje" && (valor > 100 || !Number.isInteger(valor))) {
      return { error: "El porcentaje debe ser un número entero entre 1 y 100" };
    }
    if (tipo === "monto" && !Number.isInteger(valor)) {
      return { error: "El monto debe ser un número entero en pesos" };
    }
    datos.tipo = tipo;
    datos.valor = valor;
  }

  if (!parcial || body.servicios !== undefined) {
    const ids = Array.isArray(body.servicios) ? body.servicios : [];
    if (ids.length === 0) {
      return { error: "Elige al menos un servicio para el código" };
    }
    if (!ids.every((i) => mongoose.isValidObjectId(i))) {
      return { error: "Hay servicios inválidos" };
    }
    const existentes = await Servicio.countDocuments({
      _id: { $in: ids },
      empresa: empresaId,
    });
    if (existentes !== new Set(ids.map(String)).size) {
      return { error: "Alguno de los servicios no pertenece a tu negocio" };
    }
    datos.servicios = [...new Set(ids.map(String))];
  }

  const inicio = parsearDia(body.fechaInicio);
  const fin = parsearDia(body.fechaFin);
  if (inicio === undefined && body.fechaInicio !== undefined) {
    return { error: "La fecha de inicio no es válida" };
  }
  if (fin === undefined && body.fechaFin !== undefined) {
    return { error: "La fecha de término no es válida" };
  }
  if (inicio !== undefined) datos.fechaInicio = inicio;
  if (fin !== undefined) datos.fechaFin = fin;

  const cupos = parsearEnteroOpcional(body.cupos);
  if (cupos === undefined && body.cupos !== undefined) {
    return { error: "Los cupos deben ser un número entero mayor a 0 (o vacío)" };
  }
  if (cupos !== undefined) datos.cupos = cupos;

  const maxCliente = parsearEnteroOpcional(body.maxUsosPorCliente);
  if (maxCliente === undefined && body.maxUsosPorCliente !== undefined) {
    return {
      error: "El límite por cliente debe ser un número entero mayor a 0 (o vacío)",
    };
  }
  if (maxCliente !== undefined) datos.maxUsosPorCliente = maxCliente;

  if (body.descripcion !== undefined) {
    datos.descripcion = String(body.descripcion || "").trim().slice(0, 200);
  }
  if (body.activo !== undefined) datos.activo = !!body.activo;

  return { datos };
};

/* =====================================================
   LISTAR (con usos y ahorro total de cada código)
===================================================== */
export const listarCodigos = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;

    const codigos = await CodigoDescuento.find({ empresa: empresaId })
      .populate("servicios", "nombre")
      .sort({ createdAt: -1 })
      .lean();

    const ids = codigos.map((c) => c._id);
    const filas = ids.length
      ? await Reserva.aggregate([
          {
            $match: {
              "codigoDescuento.codigoId": { $in: ids },
              estado: { $nin: ESTADOS_QUE_NO_CUENTAN },
            },
          },
          {
            $group: {
              _id: "$codigoDescuento.codigoId",
              usos: { $sum: 1 },
              ahorro: { $sum: "$codigoDescuento.descuentoAplicado" },
            },
          },
        ])
      : [];
    const porId = new Map(filas.map((f) => [String(f._id), f]));

    const resultado = codigos.map((c) => {
      const f = porId.get(String(c._id));
      const usos = f?.usos || 0;
      return {
        ...c,
        usos,
        ahorroTotal: f?.ahorro || 0,
        usosRestantes: c.cupos != null ? Math.max(0, c.cupos - usos) : null,
        estadoVigencia: estadoVigenciaCodigo(c, usos),
      };
    });

    return res.json(resultado);
  } catch (error) {
    console.error("Error al listar códigos de descuento:", error);
    return res.status(500).json({ message: "No se pudieron cargar los códigos" });
  }
};

/* =====================================================
   CREAR
===================================================== */
export const crearCodigo = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;

    const codigo = normalizarCodigo(req.body.codigo);
    if (!FORMATO_CODIGO.test(codigo)) {
      return res.status(400).json({
        message:
          "El código debe tener entre 3 y 20 caracteres: letras, números, guion o guion bajo (sin espacios)",
      });
    }

    const { datos, error } = await validarCuerpo(req.body, empresaId);
    if (error) return res.status(400).json({ message: error });

    if (datos.fechaInicio && datos.fechaFin && datos.fechaFin < datos.fechaInicio) {
      return res
        .status(400)
        .json({ message: "La fecha de término no puede ser anterior al inicio" });
    }

    const existe = await CodigoDescuento.findOne({ empresa: empresaId, codigo });
    if (existe) {
      return res
        .status(409)
        .json({ message: `Ya tienes un código llamado ${codigo}` });
    }

    const creado = await CodigoDescuento.create({
      ...datos,
      codigo,
      empresa: empresaId,
      creadoPor: req.usuario.id,
    });

    return res.status(201).json(creado);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Ya tienes un código con ese nombre" });
    }
    console.error("Error al crear código de descuento:", error);
    return res.status(500).json({ message: "No se pudo crear el código" });
  }
};

/* =====================================================
   EDITAR / PAUSAR (el nombre del código no se cambia)
===================================================== */
export const actualizarCodigo = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Código inválido" });
    }

    const actual = await CodigoDescuento.findOne({ _id: id, empresa: empresaId });
    if (!actual) return res.status(404).json({ message: "Código no encontrado" });

    const { datos, error } = await validarCuerpo(req.body, empresaId, {
      parcial: true,
    });
    if (error) return res.status(400).json({ message: error });

    const inicio = datos.fechaInicio !== undefined ? datos.fechaInicio : actual.fechaInicio;
    const fin = datos.fechaFin !== undefined ? datos.fechaFin : actual.fechaFin;
    if (inicio && fin && fin < inicio) {
      return res
        .status(400)
        .json({ message: "La fecha de término no puede ser anterior al inicio" });
    }

    const actualizado = await CodigoDescuento.findOneAndUpdate(
      { _id: id, empresa: empresaId },
      { $set: datos },
      { new: true },
    );

    return res.json(actualizado);
  } catch (error) {
    console.error("Error al actualizar código de descuento:", error);
    return res.status(500).json({ message: "No se pudo actualizar el código" });
  }
};

/* =====================================================
   ELIMINAR (las reservas ya hechas conservan su descuento)
===================================================== */
export const eliminarCodigo = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId;
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Código inválido" });
    }

    const borrado = await CodigoDescuento.findOneAndDelete({
      _id: id,
      empresa: empresaId,
    });
    if (!borrado) return res.status(404).json({ message: "Código no encontrado" });

    return res.json({ message: "Código eliminado" });
  } catch (error) {
    console.error("Error al eliminar código de descuento:", error);
    return res.status(500).json({ message: "No se pudo eliminar el código" });
  }
};

/* =====================================================
   VALIDAR (público, lo usa el cliente al escribir el código)
   Solo calcula y devuelve el precio: no consume nada. La reserva vuelve a
   validar el código por su cuenta al crearse, así que esto es informativo.
   body: { codigo, servicioId, barberoId?, fecha? (YYYY-MM-DD), hora? (HH:mm), clienteId? }
===================================================== */
export const validarCodigoPublico = async (req, res) => {
  try {
    const { slug } = req.params;
    const { codigo, servicioId, barberoId, fecha, hora, clienteId } = req.body;

    if (!codigo || !servicioId || !mongoose.isValidObjectId(servicioId)) {
      return res.status(400).json({ valido: false, message: "Faltan datos" });
    }

    const empresa = await empresaModel.findOne({ slug });
    if (!empresa) {
      return res.status(404).json({ valido: false, message: "Negocio no encontrado" });
    }
    if (empresa.estado === "inactivo") {
      return res.status(403).json({ valido: false, message: "Negocio no disponible" });
    }

    const servicio = await Servicio.findOne({ _id: servicioId, empresa: empresa._id });
    if (!servicio) {
      return res.status(404).json({ valido: false, message: "Servicio no encontrado" });
    }

    // Mismo cálculo de precio que al crear la reserva
    let momento = null;
    if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      const horaOk = /^\d{2}:\d{2}$/.test(hora || "") ? hora : "12:00";
      momento = dayjs.tz(`${fecha} ${horaOk}`, "YYYY-MM-DD HH:mm", ZONA);
    }

    let precioBase = Number(servicio.precio ?? 0);
    if (momento?.isValid()) {
      const especial = barberoId && mongoose.isValidObjectId(barberoId)
        ? await obtenerPrecioEspecial(barberoId, servicioId, momento.toDate())
        : null;
      precioBase =
        especial != null ? especial : servicio.calcularPrecioFinal(momento.toDate());
    } else {
      precioBase = servicio.calcularPrecioFinal(new Date());
    }

    const evaluacion = await evaluarCodigoDescuento({
      empresaId: empresa._id,
      codigo,
      servicioId,
      precioBase,
      precioLista: Number(servicio.precio ?? 0),
      clienteId:
        clienteId && mongoose.isValidObjectId(clienteId) ? clienteId : null,
    });

    if (!evaluacion.ok) {
      return res.json({ valido: false, message: evaluacion.message });
    }

    return res.json({
      valido: true,
      codigo: evaluacion.codigoDoc.codigo,
      tipo: evaluacion.codigoDoc.tipo,
      valor: evaluacion.codigoDoc.valor,
      descuento: evaluacion.descuento,
      precioOriginal: evaluacion.precioOriginal,
      precioFinal: evaluacion.precioFinal,
    });
  } catch (error) {
    console.error("Error al validar código de descuento:", error);
    return res.status(500).json({ valido: false, message: "No se pudo validar el código" });
  }
};
