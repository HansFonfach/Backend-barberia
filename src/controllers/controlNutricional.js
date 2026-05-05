// controllers/control.controller.js
import ControlNutricional from "../models/controlNutricional.model.js";
import FichaPaciente from "../models/fichaPaciente.model.js";
import Reserva from "../models/reserva.model.js";
import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier";

// ================================================
// GET /api/controles/:fichaId
// Historial de controles de una ficha
// ================================================
export const obtenerControles = async (req, res) => {
  try {
    const { fichaId } = req.params;

    // Verificar que la ficha pertenece a la empresa
    const ficha = await FichaPaciente.findOne({
      _id: fichaId,
      empresa: req.empresaId,
      deletedAt: null,
    });

    if (!ficha) {
      return res.status(404).json({ message: "Ficha no encontrada" });
    }

    const controles = await ControlNutricional.find({ ficha: fichaId })
      .populate("profesional", "nombre apellido")
      .populate("reserva", "fecha estado")
      .sort({ numeroControl: -1 });

    return res.json(controles);
  } catch (error) {
    console.error("[obtenerControles]", error);
    return res.status(500).json({ message: "Error al obtener controles" });
  }
};

// ================================================
// GET /api/controles/detalle/:controlId
// Obtener un control específico
// ================================================
export const obtenerControlDetalle = async (req, res) => {
  try {
    const { controlId } = req.params;

    const control = await ControlNutricional.findOne({
      _id: controlId,
      empresa: req.empresaId,
    })
      .populate("profesional", "nombre apellido")
      .populate("reserva", "fecha estado")
      .populate({
        path: "ficha",
        populate: { path: "paciente", select: "nombre apellido email telefono rut" },
      });

    if (!control) {
      return res.status(404).json({ message: "Control no encontrado" });
    }

    return res.json(control);
  } catch (error) {
    console.error("[obtenerControlDetalle]", error);
    return res.status(500).json({ message: "Error al obtener control" });
  }
};

// ================================================
// POST /api/controles
// Crear nuevo control
// ================================================
export const crearControl = async (req, res) => {
  try {
    const {
      fichaId,
      reservaId,
      fecha,
      tipoControl,
      antropometria,
      evaluacionDietetica,
      examenes,
      plan,
      evolucion,
      recomendaciones,
      proximoControl,
      notas,
    } = req.body;

    // ── Validaciones obligatorias ──
    if (!fichaId) {
      return res.status(400).json({ message: "La ficha es obligatoria" });
    }
    if (!fecha) {
      return res.status(400).json({ message: "La fecha es obligatoria" });
    }

    // ── Verificar que la ficha existe y pertenece a la empresa ──
    const ficha = await FichaPaciente.findOne({
      _id: fichaId,
      empresa: req.empresaId,
      deletedAt: null,
    });

    if (!ficha) {
      return res.status(404).json({ message: "Ficha no encontrada" });
    }

    // ── Verificar reserva si viene ──
    if (reservaId) {
      const reserva = await Reserva.findOne({
        _id: reservaId,
        empresa: req.empresaId,
      });

      if (!reserva) {
        return res.status(404).json({ message: "Reserva no encontrada" });
      }

      // Verificar que la reserva no tenga ya un control asociado
      const controlExistente = await ControlNutricional.findOne({ reserva: reservaId });
      if (controlExistente) {
        return res.status(409).json({ message: "Esta reserva ya tiene un control registrado" });
      }
    }

    // ── Validar tipoControl si viene ──
    const tiposValidos = ["primera_vez", "control", "urgencia", "teleconsulta"];
    if (tipoControl && !tiposValidos.includes(tipoControl)) {
      return res.status(400).json({ message: "Tipo de control inválido" });
    }

    // ── Validar metodoMedicion si viene ──
    const metodosValidos = ["báscula", "bioimpedancia", "pliegues", "otro"];
    if (antropometria?.metodoMedicion && !metodosValidos.includes(antropometria.metodoMedicion)) {
      return res.status(400).json({ message: "Método de medición inválido" });
    }

    // ── Validar adherencia si viene ──
    const adherenciasValidas = ["excelente", "buena", "regular", "mala", "sin_plan_previo"];
    if (evolucion?.adherenciaPlanAnterior && !adherenciasValidas.includes(evolucion.adherenciaPlanAnterior)) {
      return res.status(400).json({ message: "Valor de adherencia inválido" });
    }

    // ── Calcular IMC automáticamente si vienen peso y talla ──
    let imcCalculado = antropometria?.imc ?? null;
    if (antropometria?.peso && antropometria?.talla) {
      const tallaMts = antropometria.talla / 100;
      imcCalculado = parseFloat(
        (antropometria.peso / (tallaMts * tallaMts)).toFixed(2)
      );
    }

    // ── Calcular índice cintura/cadera si vienen ambos ──
    let icc = antropometria?.indiceCinturaCaldera ?? null;
    if (antropometria?.circunferenciaCintura && antropometria?.circunferenciaCadera) {
      icc = parseFloat(
        (antropometria.circunferenciaCintura / antropometria.circunferenciaCadera).toFixed(2)
      );
    }

    // ── Calcular número de control automáticamente ──
    const totalControles = await ControlNutricional.countDocuments({ ficha: fichaId });
    const numeroControl = totalControles + 1;

    const control = new ControlNutricional({
      empresa: req.empresaId,
      ficha: fichaId,
      reserva: reservaId ?? null,
      profesional: req.usuario.id,
      fecha,
      numeroControl,
      tipoControl: tipoControl ?? "control",
      antropometria: {
        ...antropometria,
        imc: imcCalculado,
        indiceCinturaCaldera: icc,
      },
      evaluacionDietetica,
      examenes: examenes ?? [],
      plan,
      evolucion,
      recomendaciones,
      proximoControl,
      notas,
      estado: "borrador",
    });

    await control.save();

    // ── Si viene reservaId, vincular el control a la reserva ──
    if (reservaId) {
      await Reserva.findByIdAndUpdate(reservaId, {
        controlClinico: control._id,
      });
    }

    return res.status(201).json({
      message: "Control creado correctamente",
      control,
    });
  } catch (error) {
    console.error("[crearControl]", error);
    return res.status(500).json({ message: "Error al crear control" });
  }
};

// ================================================
// PUT /api/controles/:controlId
// Actualizar control (mientras está en borrador)
// ================================================
export const actualizarControl = async (req, res) => {
  try {
    const { controlId } = req.params;

    const control = await ControlNutricional.findOne({
      _id: controlId,
      empresa: req.empresaId,
    });

    if (!control) {
      return res.status(404).json({ message: "Control no encontrado" });
    }

    // Un control completado no se puede editar
    if (control.estado === "completado") {
      return res.status(400).json({ message: "No se puede editar un control ya completado" });
    }

    const camposPermitidos = [
      "fecha",
      "tipoControl",
      "antropometria",
      "evaluacionDietetica",
      "examenes",
      "plan",
      "evolucion",
      "recomendaciones",
      "proximoControl",
      "notas",
      "estado",
    ];

    // ── Validaciones si vienen ──
    const { tipoControl, antropometria, evolucion, estado } = req.body;

    const tiposValidos = ["primera_vez", "control", "urgencia", "teleconsulta"];
    if (tipoControl && !tiposValidos.includes(tipoControl)) {
      return res.status(400).json({ message: "Tipo de control inválido" });
    }

    const metodosValidos = ["báscula", "bioimpedancia", "pliegues", "otro"];
    if (antropometria?.metodoMedicion && !metodosValidos.includes(antropometria.metodoMedicion)) {
      return res.status(400).json({ message: "Método de medición inválido" });
    }

    const adherenciasValidas = ["excelente", "buena", "regular", "mala", "sin_plan_previo"];
    if (evolucion?.adherenciaPlanAnterior && !adherenciasValidas.includes(evolucion.adherenciaPlanAnterior)) {
      return res.status(400).json({ message: "Valor de adherencia inválido" });
    }

    const estadosValidos = ["borrador", "completado"];
    if (estado && !estadosValidos.includes(estado)) {
      return res.status(400).json({ message: "Estado inválido" });
    }

    // ── Recalcular IMC si cambian peso o talla ──
    if (antropometria?.peso && antropometria?.talla) {
      const tallaMts = antropometria.talla / 100;
      req.body.antropometria.imc = parseFloat(
        (antropometria.peso / (tallaMts * tallaMts)).toFixed(2)
      );
    }

    // ── Recalcular ICC si cambian las medidas ──
    if (antropometria?.circunferenciaCintura && antropometria?.circunferenciaCadera) {
      req.body.antropometria.indiceCinturaCaldera = parseFloat(
        (antropometria.circunferenciaCintura / antropometria.circunferenciaCadera).toFixed(2)
      );
    }

    camposPermitidos.forEach((campo) => {
      if (req.body[campo] !== undefined) {
        control[campo] = req.body[campo];
      }
    });

    await control.save();

    return res.json({
      message: "Control actualizado correctamente",
      control,
    });
  } catch (error) {
    console.error("[actualizarControl]", error);
    return res.status(500).json({ message: "Error al actualizar control" });
  }
};

// ================================================
// POST /api/controles/:controlId/plan-pdf
// Subir PDF del plan alimentario a Cloudinary
// ================================================
export const subirPlanPdf = async (req, res) => {
  try {
    const { controlId } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: "No se recibió ningún archivo" });
    }

    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ message: "Solo se permiten archivos PDF" });
    }

    const control = await ControlNutricional.findOne({
      _id: controlId,
      empresa: req.empresaId,
    });

    if (!control) {
      return res.status(404).json({ message: "Control no encontrado" });
    }

    // ── Eliminar PDF anterior de Cloudinary si existe ──
    if (control.plan?.archivoPublicId) {
      await cloudinary.uploader.destroy(control.plan.archivoPublicId, {
        resource_type: "raw",
      });
    }

    // ── Subir nuevo PDF ──
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `planes/${req.empresaId}`,
          resource_type: "raw",
          format: "pdf",
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      streamifier.createReadStream(req.file.buffer).pipe(stream);
    });

    control.plan = {
      ...control.plan,
      archivoUrl: uploadResult.secure_url,
      archivoPublicId: uploadResult.public_id,
    };

    await control.save();

    return res.json({
      message: "Plan alimentario subido correctamente",
      url: uploadResult.secure_url,
    });
  } catch (error) {
    console.error("[subirPlanPdf]", error);
    return res.status(500).json({ message: "Error al subir el plan" });
  }
};