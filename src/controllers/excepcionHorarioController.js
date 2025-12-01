import excepcionHorario from "../models/excepcionHorario.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

// Función auxiliar para convertir fecha Chile a UTC del inicio del día CHILE
const fechaChileToUTC = (fechaChileStr) => {
  // fechaChileStr: "YYYY-MM-DD"
  // Creamos la fecha en Chile a las 00:00
  const fechaChile = dayjs.tz(`${fechaChileStr} 00:00`, "YYYY-MM-DD HH:mm", "America/Santiago");
  // Convertimos a UTC
  return fechaChile.utc().toDate();
};

export const cancelarHora = async (req, res) => {
  const { barbero, fecha, horaInicio, motivo } = req.body;

  try {
    // Convertir fecha Chile a UTC
    const fechaUTC = fechaChileToUTC(fecha);

    const horaCancelada = await excepcionHorario.create({
      barbero,
      fecha: fechaUTC,
      horaInicio,
      motivo,
      tipo: "bloqueo",
    });

    res.status(201).json({
      message: "Hora cancelada correctamente",
      horaCancelada,
      fechaOriginal: fecha,
      fechaUTC: fechaUTC,
    });
  } catch (error) {
    console.error("❌ Error en cancelarHora:", error);
    res.status(500).json({ message: "Error al cancelar la hora", error });
  }
};

export const revertirHora = async (req, res) => {
  const { barbero, fecha, horaInicio } = req.body;

  try {
    const fechaUTC = fechaChileToUTC(fecha);

    const eliminado = await excepcionHorario.findOneAndDelete({
      barbero,
      fecha: fechaUTC,
      horaInicio,
      tipo: "bloqueo",
    });

    if (!eliminado) {
      return res
        .status(404)
        .json({ message: "No se encontró la hora cancelada" });
    }

    res.status(200).json({ 
      message: "Hora disponible nuevamente",
      fechaOriginal: fecha
    });
  } catch (error) {
    console.error("❌ Error en revertirHora:", error);
    res.status(500).json({ message: "Error al revertir hora", error });
  }
};

export const agregarHoraExtra = async (req, res) => {
  const { barbero, fecha, horaInicio } = req.body;

  try {
    const fechaUTC = fechaChileToUTC(fecha);

    const horaExtra = await excepcionHorario.create({
      barbero,
      fecha: fechaUTC,
      horaInicio,
      tipo: "extra",
    });

    res.status(201).json({
      message: "Hora extra agregada correctamente",
      horaExtra,
      fechaOriginal: fecha,
    });
  } catch (error) {
    console.error("❌ Error en agregarHoraExtra:", error);
    res.status(500).json({ message: "Error al agregar la hora extra", error });
  }
};

export const cancelarHoraExtra = async (req, res) => {
  const { barbero, fecha, horaInicio } = req.body;

  try {
    const fechaUTC = fechaChileToUTC(fecha);

    const horaExtraCancelada = await excepcionHorario.findOneAndDelete({
      barbero,
      fecha: fechaUTC,
      horaInicio,
      tipo: "extra",
    });

    if (!horaExtraCancelada)
      return res.status(404).json({ message: "No se encontró la hora extra" });

    res.status(200).json({ 
      message: "Hora extra cancelada correctamente",
      fechaOriginal: fecha
    });
  } catch (error) {
    console.error("❌ Error en cancelarHoraExtra:", error);
    res.status(500).json({ message: "Error al cancelar la hora extra", error });
  }
};

export const obtenerExcepcionesPorDia = async (req, res) => {
  const { barberoId } = req.params;
  const { fecha } = req.query; // fecha en formato "YYYY-MM-DD" (Chile)

  if (!fecha) {
    return res.status(400).json({ message: "Se requiere la fecha" });
  }

  try {
    // IMPORTANTE: Rango UTC correspondiente al día completo en Chile
    const inicioDiaChile = dayjs.tz(`${fecha} 00:00`, "YYYY-MM-DD HH:mm", "America/Santiago");
    const finDiaChile = dayjs.tz(`${fecha} 23:59:59.999`, "YYYY-MM-DD HH:mm:ss.SSS", "America/Santiago");
    
    const inicioUTC = inicioDiaChile.utc().toDate();
    const finUTC = finDiaChile.utc().toDate();

    console.log(`🔍 Buscando excepciones para fecha Chile: ${fecha}`);
    console.log(`   Rango UTC: ${inicioUTC.toISOString()} - ${finUTC.toISOString()}`);

    // Buscar excepciones en ese rango UTC
    const excepciones = await excepcionHorario.find({
      barbero: barberoId,
      fecha: { $gte: inicioUTC, $lte: finUTC },
    }).sort({ horaInicio: 1 });

    console.log(`   Encontradas: ${excepciones.length} excepciones`);

    // Convertir fechas UTC a fecha Chile para mostrar
    const excepcionesFormateadas = excepciones.map((excepcion) => {
      const fechaUTC = dayjs(excepcion.fecha);
      const fechaChile = fechaUTC.tz("America/Santiago");
      
      return {
        ...excepcion._doc,
        fechaChile: fechaChile.format("YYYY-MM-DD"),
        fechaUTC: fechaUTC.format("YYYY-MM-DD HH:mm:ssZ"),
      };
    });

    res.status(200).json({
      fecha: fecha,
      fechaBusqueda: fecha,
      excepciones: excepcionesFormateadas,
      total: excepcionesFormateadas.length,
      rangoUTC: {
        inicio: inicioUTC.toISOString(),
        fin: finUTC.toISOString()
      }
    });
  } catch (error) {
    console.error("❌ Error al obtener excepciones:", error);
    res.status(500).json({ message: "Error al obtener excepciones", error });
  }
};

// Función para debug
export const verificarFecha = async (req, res) => {
  const { fecha } = req.query; // "YYYY-MM-DD" (Chile)
  
  const inicioDiaChile = dayjs.tz(`${fecha} 00:00`, "YYYY-MM-DD HH:mm", "America/Santiago");
  const finDiaChile = dayjs.tz(`${fecha} 23:59:59.999`, "YYYY-MM-DD HH:mm:ss.SSS", "America/Santiago");
  
  const inicioUTC = inicioDiaChile.utc();
  const finUTC = finDiaChile.utc();
  
  res.json({
    fechaChile: fecha,
    inicioChile: inicioDiaChile.format("YYYY-MM-DD HH:mm:ss"),
    finChile: finDiaChile.format("YYYY-MM-DD HH:mm:ss"),
    inicioUTC: inicioUTC.format("YYYY-MM-DD HH:mm:ss"),
    finUTC: finUTC.format("YYYY-MM-DD HH:mm:ss"),
    offsetChile: inicioDiaChile.format("Z"),
    diferenciaHoras: inicioDiaChile.diff(inicioUTC, 'hour'),
    mensaje: `Cuando en Chile es ${fecha} 00:00, en UTC es ${inicioUTC.format("YYYY-MM-DD HH:mm:ss")}`
  });
};