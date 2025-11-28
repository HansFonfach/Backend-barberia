import Feriado from "../models/feriados.js";
import axios from "axios";

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

/** Cargar feriados desde API Nager.Date */
export const cargarFeriadosChile = async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const { data } = await axios.get(`https://date.nager.at/api/v3/PublicHolidays/${year}/CL`);

    let cargados = 0;

    for (const f of data) {
      const fecha = new Date(f.date); // <- date en vez de fecha
      const nombre = f.localName;     // <- localName en vez de nombre

      const existe = await Feriado.findOne({ fecha });
      if (existe) continue;

      await Feriado.create({
        fecha,
        nombre,
        activo: true
      });

      cargados++;
    }

    res.json({ message: `Feriados cargados: ${cargados}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al cargar feriados" });
  }
};
