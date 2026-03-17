export const generarMensajeRecordatorio = (cliente, servicio, tipoCliente, empresa) => {
  const nombreEmpresa = empresa?.nombre || "nosotros";
  const nombre = cliente.nombre.split(" ")[0]; // Solo el primer nombre, más cercano

  if (tipoCliente === "nuevo") {
    return {
      titulo: "¿Cómo va el corte? 👀",
      cuerpo: `Hola <strong>${nombre}</strong>,<br><br>
        Ya debe estar empezando a crecer un poco tu <strong>${servicio.nombre}</strong> 😄<br>
        En <strong>${nombreEmpresa}</strong> tenemos tu hora esperando. ¿La agendamos?`
    };
  }

  if (tipoCliente === "medio") {
    return {
      titulo: "Tu corte está perdiendo forma ✂️",
      cuerpo: `Hola <strong>${nombre}</strong>,<br><br>
        Hace un tiempo que no pasas por <strong>${nombreEmpresa}</strong> y tu <strong>${servicio.nombre}</strong> 
        ya lo debe estar notando 👀<br><br>
        Agéndate antes de que el pelo mande. 😄`
    };
  }

  // fiel / recurrente
  return {
    titulo: "Ya es hora, ${nombre} ✂️",
    cuerpo: `Hola <strong>${nombre}</strong>,<br><br>
      Conocemos tu ritmo y sabemos que ya es momento del <strong>${servicio.nombre}</strong> en 
      <strong>${nombreEmpresa}</strong>.<br><br>
      Reserva tu hora y llega como siempre: puntual y con estilo. 💈`
  };
};