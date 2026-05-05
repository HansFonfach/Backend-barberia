// controllers/ficha.controller.js

import fichaPacienteModel from "../models/fichaPaciente.model.js";
import Usuario from "../models/usuario.model.js";

// ================================================
// GET /api/fichas
// Obtener todas las fichas de la empresa
// ================================================
export const obtenerFichas = async (req, res) => {
  try {
    const fichas = await fichaPacienteModel.find({
      empresa: req.empresaId,
      deletedAt: null,
    })
      .populate("paciente", "nombre apellido email telefono rut")
      .populate("profesional", "nombre apellido")
      .sort({ createdAt: -1 });

    return res.json(fichas);
  } catch (error) {
    console.error("[obtenerFichas]", error);
    return res.status(500).json({ message: "Error al obtener fichas" });
  }
};

// ================================================
// GET /api/fichas/:pacienteId
// Obtener ficha de un paciente específico
// ================================================
export const obtenerFichaPorPaciente = async (req, res) => {
  try {
    const { pacienteId } = req.params;

    const ficha = await FichaPaciente.findOne({
      empresa: req.empresaId,
      paciente: pacienteId,
      deletedAt: null,
    })
      .populate("paciente", "nombre apellido email telefono rut")
      .populate("profesional", "nombre apellido");

    if (!ficha) {
      return res.status(404).json({ message: "Ficha no encontrada" });
    }

    return res.json(ficha);
  } catch (error) {
    console.error("[obtenerFichaPorPaciente]", error);
    return res.status(500).json({ message: "Error al obtener ficha" });
  }
};

// ================================================
// POST /api/fichas
// Crear ficha de un paciente
// ================================================
export const crearFicha = async (req, res) => {
  try {
    const {
      pacienteId,
      profesionalId,
      fechaNacimiento,
      sexo,
      ocupacion,
      prevision,
      motivoConsulta,
      antecedentesPatologicos,
      antecedentesFamiliares,
      medicamentos,
      alergias,
      cirugiasPrevias,
      habitos,
      objetivos,
      notas,
    } = req.body;

    // ── Validaciones obligatorias ──
    if (!pacienteId) {
      return res.status(400).json({ message: "El paciente es obligatorio" });
    }
    if (!profesionalId) {
      return res.status(400).json({ message: "El profesional es obligatorio" });
    }

    // ── Verificar que el paciente existe y pertenece a la empresa ──
    const paciente = await Usuario.findOne({
      _id: pacienteId,
      empresa: req.empresaId,
      deletedAt: null,
    });

    if (!paciente) {
      return res.status(404).json({ message: "Paciente no encontrado" });
    }

    // ── Verificar que el profesional existe y pertenece a la empresa ──
    const profesional = await Usuario.findOne({
      _id: profesionalId,
      empresa: req.empresaId,
      deletedAt: null,
    });

    if (!profesional) {
      return res.status(404).json({ message: "Profesional no encontrado" });
    }

    // ── Verificar que no exista ya una ficha para este paciente ──
    const fichaExistente = await FichaPaciente.findOne({
      empresa: req.empresaId,
      paciente: pacienteId,
      deletedAt: null,
    });

    if (fichaExistente) {
      return res.status(409).json({ message: "Este paciente ya tiene una ficha registrada" });
    }

    // ── Validar sexo si viene ──
    const sexosValidos = ["masculino", "femenino", "otro"];
    if (sexo && !sexosValidos.includes(sexo)) {
      return res.status(400).json({ message: "Sexo inválido" });
    }

    // ── Validar prevision si viene ──
    const previsionesValidas = ["fonasa", "isapre", "particular", "otro"];
    if (prevision && !previsionesValidas.includes(prevision)) {
      return res.status(400).json({ message: "Previsión inválida" });
    }

    // ── Validar nivel de actividad si viene ──
    const nivelesActividad = ["sedentario", "leve", "moderado", "intenso", "muy_intenso"];
    if (habitos?.nivelActividad && !nivelesActividad.includes(habitos.nivelActividad)) {
      return res.status(400).json({ message: "Nivel de actividad inválido" });
    }

    const ficha = new FichaPaciente({
      empresa: req.empresaId,
      paciente: pacienteId,
      profesional: profesionalId,
      fechaNacimiento,
      sexo,
      ocupacion,
      prevision,
      motivoConsulta,
      antecedentesPatologicos: antecedentesPatologicos ?? [],
      antecedentesFamiliares: antecedentesFamiliares ?? [],
      medicamentos: medicamentos ?? [],
      alergias: alergias ?? [],
      cirugiasPrevias: cirugiasPrevias ?? [],
      habitos,
      objetivos,
      notas,
    });

    await ficha.save();

    return res.status(201).json({
      message: "Ficha creada correctamente",
      ficha,
    });
  } catch (error) {
    console.error("[crearFicha]", error);
    return res.status(500).json({ message: "Error al crear ficha" });
  }
};

// ================================================
// PUT /api/fichas/:fichaId
// Actualizar ficha
// ================================================
export const actualizarFicha = async (req, res) => {
  try {
    const { fichaId } = req.params;

    const ficha = await FichaPaciente.findOne({
      _id: fichaId,
      empresa: req.empresaId,
      deletedAt: null,
    });

    if (!ficha) {
      return res.status(404).json({ message: "Ficha no encontrada" });
    }

    const camposPermitidos = [
      "fechaNacimiento",
      "sexo",
      "ocupacion",
      "prevision",
      "motivoConsulta",
      "antecedentesPatologicos",
      "antecedentesFamiliares",
      "medicamentos",
      "alergias",
      "cirugiasPrevias",
      "habitos",
      "objetivos",
      "estado",
      "notas",
    ];

    // ── Validaciones si vienen los campos ──
    const { sexo, prevision, habitos, estado } = req.body;

    const sexosValidos = ["masculino", "femenino", "otro"];
    if (sexo && !sexosValidos.includes(sexo)) {
      return res.status(400).json({ message: "Sexo inválido" });
    }

    const previsionesValidas = ["fonasa", "isapre", "particular", "otro"];
    if (prevision && !previsionesValidas.includes(prevision)) {
      return res.status(400).json({ message: "Previsión inválida" });
    }

    const nivelesActividad = ["sedentario", "leve", "moderado", "intenso", "muy_intenso"];
    if (habitos?.nivelActividad && !nivelesActividad.includes(habitos.nivelActividad)) {
      return res.status(400).json({ message: "Nivel de actividad inválido" });
    }

    const estadosValidos = ["activo", "inactivo", "alta"];
    if (estado && !estadosValidos.includes(estado)) {
      return res.status(400).json({ message: "Estado inválido" });
    }

    // ── Solo actualizar campos permitidos ──
    camposPermitidos.forEach((campo) => {
      if (req.body[campo] !== undefined) {
        ficha[campo] = req.body[campo];
      }
    });

    await ficha.save();

    return res.json({
      message: "Ficha actualizada correctamente",
      ficha,
    });
  } catch (error) {
    console.error("[actualizarFicha]", error);
    return res.status(500).json({ message: "Error al actualizar ficha" });
  }
};

// ================================================
// DELETE /api/fichas/:fichaId
// Soft delete de ficha
// ================================================
export const eliminarFicha = async (req, res) => {
  try {
    const { fichaId } = req.params;

    const ficha = await FichaPaciente.findOne({
      _id: fichaId,
      empresa: req.empresaId,
      deletedAt: null,
    });

    if (!ficha) {
      return res.status(404).json({ message: "Ficha no encontrada" });
    }

    ficha.deletedAt = new Date();
    await ficha.save();

    return res.json({ message: "Ficha eliminada correctamente" });
  } catch (error) {
    console.error("[eliminarFicha]", error);
    return res.status(500).json({ message: "Error al eliminar ficha" });
  }
};