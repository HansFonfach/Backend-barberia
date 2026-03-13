export const generarMensajeRecordatorio = (cliente, servicio, tipoCliente) => {

  if (tipoCliente === "nuevo") {
    return `Hola ${cliente.nombre} 👋

¿Te gustaría repetir tu ${servicio.nombre}?

Reserva aquí cuando quieras ✨`;
  }

  if (tipoCliente === "medio") {
    return `Hola ${cliente.nombre} 👋

Hace tiempo que no reservas tu ${servicio.nombre}.

Te esperamos nuevamente 💈`;
  }

  return `${cliente.nombre} ✂️

Tu ${servicio.nombre} ya debería renovarse.

Reserva tu hora cuando quieras.`;
};