// controllers/feriados.controller.js
import Feriado from "../models/feriados.js";
import axios from "axios";
import dayjs from "dayjs";

/** Obtener todos */
export const getFeriados = async (req, res) => {
  try {
    const feriados = await Feriado.find().sort({ fecha: 1 });
    res.json(feriados);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener feriados" });
  }
};

/** Activar o desactivar un feriado */
export const toggleFeriado = async (req, res) => {
  try {
    const { id } = req.params;
    const feriado = await Feriado.findById(id);

    if (!feriado) return res.status(404).json({ message: "No encontrado" });

    feriado.activo = !feriado.activo;
    await feriado.save();

    res.json(feriado);
  } catch (error) {
    res.status(500).json({ message: "Error al actualizar feriado" });
  }
};

/** Cambiar comportamiento de feriado */
export const cambiarComportamientoFeriado = async (req, res) => {
  try {
    const { id } = req.params;
    const { comportamiento } = req.body;

    // Validar que sea barbero
    if (req.usuario?.rol !== "barbero") {
      return res.status(403).json({ message: "No autorizado" });
    }

    const feriado = await Feriado.findById(id);
    if (!feriado) {
      return res.status(404).json({ message: "Feriado no encontrado" });
    }

    // Validar comportamiento
    if (!["bloquear_todo", "permitir_excepciones"].includes(comportamiento)) {
      return res.status(400).json({ message: "Comportamiento inválido" });
    }

    feriado.comportamiento = comportamiento;
    await feriado.save();

    res.json({
      message: `Feriado "${feriado.nombre}" ahora ${comportamiento === "bloquear_todo" ? "bloquea completamente" : "permite excepciones"}`,
      feriado
    });
  } catch (error) {
    console.error("❌ Error al cambiar comportamiento:", error);
    res.status(500).json({ message: "Error al actualizar feriado" });
  }
};

/** Verificar feriado por fecha */
export const verificarFeriado = async (req, res) => {
  try {
    const { fecha } = req.query;
    
    if (!fecha) {
      return res.status(400).json({ message: "Fecha requerida" });
    }

    const fechaDate = new Date(fecha);
    const feriado = await Feriado.findOne({
      fecha: {
        $gte: dayjs(fechaDate).startOf('day').toDate(),
        $lt: dayjs(fechaDate).endOf('day').toDate()
      },
      activo: true
    });

    res.json({
      esFeriado: !!feriado,
      nombre: feriado?.nombre || null,
      comportamiento: feriado?.comportamiento || "permitir_excepciones",
      activo: feriado?.activo || false,
      fecha: fecha
    });
  } catch (error) {
    console.error("❌ Error al verificar feriado:", error);
    res.status(500).json({ message: "Error al verificar feriado" });
  }
};

/** Cargar feriados desde API Nager.Date */
export const cargarFeriadosChile = async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const { data } = await axios.get(`https://date.nager.at/api/v3/PublicHolidays/${year}/CL`);

    let cargados = 0;

    for (const f of data) {
      const fecha = new Date(f.date);
      const nombre = f.localName;

      const existe = await Feriado.findOne({ fecha });
      if (existe) {
        // Actualizar si ya existe
        existe.nombre = nombre;
        await existe.save();
        continue;
      }

      await Feriado.create({
        fecha,
        nombre,
        activo: true,
        comportamiento: "permitir_excepciones" // Por defecto
      });

      cargados++;
    }

    res.json({ 
      message: `Feriados cargados/actualizados: ${cargados}`,
      total: cargados
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al cargar feriados" });
  }
};