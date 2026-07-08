export const calcularPrecioServicio = (servicio, fechaReserva = null) => {
  const fechaAEvaluar = fechaReserva || new Date(); // 👈 nuevo: sin fecha, evalúa "hoy"
  if (!servicio.descuento?.activo) return servicio.precio;

  const soloFechaChile = (d) =>
    new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Santiago" });

  const fechaReservaStr = soloFechaChile(fechaAEvaluar);
  const inicioStr = servicio.descuento.fechaInicio
    ? soloFechaChile(servicio.descuento.fechaInicio)
    : null;
  const finStr = servicio.descuento.fechaFin
    ? soloFechaChile(servicio.descuento.fechaFin)
    : null;

  const yaComenzo = !inicioStr || fechaReservaStr >= inicioStr;
  const noHaTerminado = !finStr || fechaReservaStr <= finStr;

  if (!yaComenzo || !noHaTerminado) return servicio.precio;

  return (
    servicio.precio -
    Math.round(servicio.precio * (servicio.descuento.porcentaje / 100))
  );
};