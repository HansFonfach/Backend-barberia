import excepcionHorario from "../models/excepcionHorario.model.js";

export const cancelarHora = async (req, res) => {
  const { barbero, fecha, horaInicio, motivo } = req.body;

  try {
    const horaCancelada = await excepcionHorario.create({
      barbero,
      fecha: new Date(fecha),
      horaInicio,
      motivo,
      tipo: "bloqueo",
    });

    res.status(201).json({
      message: "Hora cancelada correctamente",
      horaCancelada,
    });
   
  } catch (error) {
    res.status(500).json({ message: "Error al cancelar la hora", error });
    
  }
};

export const revertirHora = async (req, res) => {
  const { barbero, fecha, horaInicio } = req.body;

  try {
    const eliminado = await excepcionHorario.findOneAndDelete({
      barbero,
      fecha: new Date(fecha),
      horaInicio,
      tipo: "bloqueo",
    });

    if (!eliminado) {
      return res
        .status(404)
        .json({ message: "No se encontró la hora cancelada" });
    }

    res.status(200).json({ message: "Hora disponible nuevamente" });
  } catch (error) {
    res.status(500).json({ message: "Error al revertir hora", error });
  }
};

export const agregarHoraExtra = async (req, res) => {
  const { barbero, fecha, horaInicio } = req.body;
  console.log(barbero, fecha, horaInicio);

  try {
    const horaExtra = await excepcionHorario.create({
      barbero,
      fecha: new Date(fecha),
      horaInicio,
      tipo: "extra",
    });

    res.status(201).json({
      message: "Hora extra agregada correctamente",
      horaExtra,
    });
  } catch (error) {
    res.status(500).json({ message: "Error al agregar la hora extra", error });
  }
};

export const cancelarHoraExtra = async (req, res) => {
  const { barbero, fecha, horaInicio } = req.body;

  try {
    const horaExtraCancelada = await excepcionHorario.findOneAndDelete({
      barbero,
      fecha: new Date(fecha),
      horaInicio,
      tipo: "extra",
    });

    if (!horaExtraCancelada)
      return res.status(404).json({ message: "No se encontró la hora extra" });

    res.status(200).json({ message: "Hora extra cancelada correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error al cancelar la hora extra", error });
  }
};

export const obtenerExcepcionesPorDia = async (req, res) => {
  const { barberoId } = req.params;
  const { fecha } = req.query; // fecha en formato "YYYY-MM-DD"

  if (!fecha) {
    return res.status(400).json({ message: "Se requiere la fecha" });
  }

  try {
    // Creamos rango UTC del día completo
    const startOfDay = new Date(`${fecha}T00:00:00Z`);
    const endOfDay = new Date(`${fecha}T23:59:59Z`);

    // Buscamos todas las excepciones de ese día para el barbero
    const excepciones = await excepcionHorario
      .find({
        barbero: barberoId,
        fecha: { $gte: startOfDay, $lte: endOfDay },
      })
      .sort({ horaInicio: 1 }); // opcional: orden por hora

    res.status(200).json(excepciones);
  } catch (error) {
    console.error("Error al obtener excepciones:", error);
    res.status(500).json({ message: "Error al obtener excepciones", error });
  }
};
