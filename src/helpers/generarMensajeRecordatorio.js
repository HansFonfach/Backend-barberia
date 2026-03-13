export const generarMensajeRecordatorio = (cliente, servicio, tipoCliente, empresa) => {
  const nombreEmpresa = empresa?.nombre || "nosotros";

  if (tipoCliente === "nuevo") {
    return {
      titulo: "¿Listo para tu próxima visita?",
      cuerpo: `Hola <strong>${cliente.nombre}</strong> 👋<br><br>
        Notamos que ha pasado un tiempo desde tu último <strong>${servicio.nombre}</strong> con <strong>${nombreEmpresa}</strong>.<br>
        Cuando quieras, estaremos listos para atenderte nuevamente. ✨`
    };
  }

  if (tipoCliente === "medio") {
    return {
      titulo: "Te echamos de menos",
      cuerpo: `Hola <strong>${cliente.nombre}</strong> 👋<br><br>
        Hace un tiempo que no nos visitas para tu <strong>${servicio.nombre}</strong> en <strong>${nombreEmpresa}</strong>.<br>
        Reserva cuando quieras, te esperamos con gusto. 😊`
    };
  }

  return {
    titulo: "Ya es momento de tu próxima visita",
    cuerpo: `Hola <strong>${cliente.nombre}</strong>,<br><br>
      Según tu historial en <strong>${nombreEmpresa}</strong>, ya es un buen momento para agendar tu <strong>${servicio.nombre}</strong>.<br>
      Reserva tu hora cuando quieras. 🗓️`
  };
};