import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { v2 as cloudinary } from "cloudinary";

import ComidaRegistradaModel from "../models/comidaRegistrada.model.js";
import RegistroAguaModel from "../models/registroAgua.model.js";
import SuplementoUsuarioModel from "../models/suplementoUsuario.model.js";
import TomaSuplementoModel from "../models/tomaSuplemento.model.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "America/Santiago";

// Diario alimenticio (modulos.entrenamientoPersonal): bitácora personal de
// comidas + agua + suplementos, pensada para apoyar controles con un
// nutricionista — no es una calculadora de calorías. Simétrico para todos
// los clientes de la empresa (dueño + amigos invitados), cada quien solo
// ve/edita lo suyo, en el mismo espíritu que entrenamientoPersonalController.js.

const ok = (res, data) => res.json({ ok: true, data });
const err = (res, msg, status = 500) =>
  res.status(status).json({ ok: false, message: msg });

const hoyStr = () => dayjs().tz(TZ).format("YYYY-MM-DD");

/* =======================================================
   🍽️ Comidas
======================================================= */

export const crearComida = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const clienteId = req.usuario.id;
    const { tipoComida, descripcion, fecha } = req.body;

    const TIPOS_VALIDOS = [
      "desayuno",
      "almuerzo",
      "once",
      "cena",
      "colacion",
      "otro",
    ];
    if (!TIPOS_VALIDOS.includes(tipoComida)) {
      return err(res, "Tipo de comida inválido", 400);
    }

    let fotoUrl = null;
    let fotoPublicId = null;

    if (req.file) {
      const uploaded = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            { folder: "diario-alimenticio" },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            },
          )
          .end(req.file.buffer);
      });
      fotoUrl = uploaded.secure_url;
      fotoPublicId = uploaded.public_id;
    }

    const comida = await ComidaRegistradaModel.create({
      empresa: empresaId,
      cliente: clienteId,
      tipoComida,
      descripcion: descripcion?.trim() || "",
      fecha: fecha ? new Date(fecha) : new Date(),
      fotoUrl,
      fotoPublicId,
    });

    ok(res, comida);
  } catch (error) {
    console.error("Error creando comida:", error);
    err(res, error.message);
  }
};

export const listarComidas = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const clienteId = req.usuario.id;
    const { desde, hasta } = req.query;

    const filtro = { empresa: empresaId, cliente: clienteId };
    if (desde || hasta) {
      filtro.fecha = {};
      if (desde) filtro.fecha.$gte = new Date(desde);
      if (hasta) filtro.fecha.$lte = new Date(hasta);
    }

    const comidas = await ComidaRegistradaModel.find(filtro).sort({
      fecha: -1,
    });

    ok(res, comidas);
  } catch (error) {
    console.error("Error listando comidas:", error);
    err(res, error.message);
  }
};

export const eliminarComida = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const clienteId = req.usuario.id;
    const { id } = req.params;

    const comida = await ComidaRegistradaModel.findOne({
      _id: id,
      empresa: empresaId,
      cliente: clienteId,
    });

    if (!comida) return err(res, "Comida no encontrada", 404);

    if (comida.fotoPublicId) {
      try {
        await cloudinary.uploader.destroy(comida.fotoPublicId);
      } catch (cloudErr) {
        // No bloquear el borrado del registro por un fallo al limpiar la
        // imagen en Cloudinary — queda un huérfano ahí, pero no es crítico.
        console.error("Error borrando foto en Cloudinary:", cloudErr);
      }
    }

    await comida.deleteOne();

    ok(res, { eliminado: true });
  } catch (error) {
    console.error("Error eliminando comida:", error);
    err(res, error.message);
  }
};

/* =======================================================
   💧 Agua
======================================================= */

export const crearAgua = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const clienteId = req.usuario.id;
    const { mililitros } = req.body;

    const ml = Number(mililitros);
    if (!ml || ml <= 0 || ml > 5000) {
      return err(res, "Cantidad de agua inválida", 400);
    }

    const registro = await RegistroAguaModel.create({
      empresa: empresaId,
      cliente: clienteId,
      mililitros: ml,
    });

    ok(res, registro);
  } catch (error) {
    console.error("Error creando registro de agua:", error);
    err(res, error.message);
  }
};

export const listarAguaHoy = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const clienteId = req.usuario.id;

    const inicioHoy = dayjs().tz(TZ).startOf("day").toDate();
    const finHoy = dayjs().tz(TZ).endOf("day").toDate();

    const registros = await RegistroAguaModel.find({
      empresa: empresaId,
      cliente: clienteId,
      fecha: { $gte: inicioHoy, $lte: finHoy },
    }).sort({ fecha: -1 });

    const totalMililitros = registros.reduce((acc, r) => acc + r.mililitros, 0);

    ok(res, { registros, totalMililitros });
  } catch (error) {
    console.error("Error listando agua de hoy:", error);
    err(res, error.message);
  }
};

export const eliminarAgua = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const clienteId = req.usuario.id;
    const { id } = req.params;

    const registro = await RegistroAguaModel.findOneAndDelete({
      _id: id,
      empresa: empresaId,
      cliente: clienteId,
    });

    if (!registro) return err(res, "Registro no encontrado", 404);

    ok(res, { eliminado: true });
  } catch (error) {
    console.error("Error eliminando registro de agua:", error);
    err(res, error.message);
  }
};

/* =======================================================
   💊 Suplementos
======================================================= */

export const crearSuplemento = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const clienteId = req.usuario.id;
    const { nombre } = req.body;

    if (!nombre?.trim()) return err(res, "Falta el nombre del suplemento", 400);

    const suplemento = await SuplementoUsuarioModel.create({
      empresa: empresaId,
      cliente: clienteId,
      nombre: nombre.trim(),
    });

    ok(res, suplemento);
  } catch (error) {
    console.error("Error creando suplemento:", error);
    err(res, error.message);
  }
};

export const listarSuplementos = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const clienteId = req.usuario.id;

    const suplementos = await SuplementoUsuarioModel.find({
      empresa: empresaId,
      cliente: clienteId,
      activo: true,
    }).sort({ createdAt: 1 });

    const fecha = hoyStr();
    const tomasHoy = await TomaSuplementoModel.find({
      suplemento: { $in: suplementos.map((s) => s._id) },
      fecha,
    });
    const idsTomadosHoy = new Set(tomasHoy.map((t) => String(t.suplemento)));

    const conEstado = suplementos.map((s) => ({
      ...s.toObject(),
      tomadoHoy: idsTomadosHoy.has(String(s._id)),
    }));

    ok(res, conEstado);
  } catch (error) {
    console.error("Error listando suplementos:", error);
    err(res, error.message);
  }
};

export const eliminarSuplemento = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const clienteId = req.usuario.id;
    const { id } = req.params;

    const suplemento = await SuplementoUsuarioModel.findOneAndUpdate(
      { _id: id, empresa: empresaId, cliente: clienteId },
      { activo: false },
      { new: true },
    );

    if (!suplemento) return err(res, "Suplemento no encontrado", 404);

    ok(res, { eliminado: true });
  } catch (error) {
    console.error("Error eliminando suplemento:", error);
    err(res, error.message);
  }
};

export const toggleTomaSuplemento = async (req, res) => {
  try {
    const empresaId = req.usuario.empresaId || req.empresaId;
    const clienteId = req.usuario.id;
    const { id } = req.params; // id del SuplementoUsuario

    const suplemento = await SuplementoUsuarioModel.findOne({
      _id: id,
      empresa: empresaId,
      cliente: clienteId,
      activo: true,
    });
    if (!suplemento) return err(res, "Suplemento no encontrado", 404);

    const fecha = hoyStr();
    const tomaExistente = await TomaSuplementoModel.findOne({
      suplemento: id,
      fecha,
    });

    if (tomaExistente) {
      await tomaExistente.deleteOne();
      return ok(res, { tomadoHoy: false });
    }

    await TomaSuplementoModel.create({
      empresa: empresaId,
      cliente: clienteId,
      suplemento: id,
      fecha,
    });
    ok(res, { tomadoHoy: true });
  } catch (error) {
    console.error("Error actualizando toma de suplemento:", error);
    err(res, error.message);
  }
};
