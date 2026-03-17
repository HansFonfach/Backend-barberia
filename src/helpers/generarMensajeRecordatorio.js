export const generarMensajeRecordatorio = (cliente, servicio, tipoCliente, empresa) => {
  const nombreEmpresa = empresa?.nombre || "nosotros";
  const nombre = cliente.nombre.split(" ")[0];
  const tipo = empresa?.tipo;

  const esBarberia = tipo === "barberia";
  const esPeluqueria = tipo === "peluqueria";
  const esSalon = tipo === "salon_belleza";
  const esSpa = tipo === "spa";
  const esCentroEstetica = tipo === "centro_estetica";

  // ---- MENSAJES POR TIPO ----
  const mensajes = {
    nuevo: {
      barberia: {
        titulo: "¿Cómo va el corte? 👀",
        cuerpo: `Hola <strong>${nombre}</strong>,<br><br>Ya debe estar empezando a crecer tu <strong>${servicio.nombre}</strong> 😄<br>En <strong>${nombreEmpresa}</strong> tenemos tu hora esperando.`
      },
      salon_belleza: {
        titulo: "¿Cómo están las pestañas? ✨",
        cuerpo: `Hola <strong>${nombre}</strong>,<br><br>Tu <strong>${servicio.nombre}</strong> en <strong>${nombreEmpresa}</strong> ya debe necesitar un retoque 💅<br>¿Lo agendamos?`
      },
      default: {
        titulo: "¿Lista para tu próxima visita?",
        cuerpo: `Hola <strong>${nombre}</strong>,<br><br>Ha pasado un tiempo desde tu último <strong>${servicio.nombre}</strong> en <strong>${nombreEmpresa}</strong>.<br>Cuando quieras, te esperamos. ✨`
      }
    },
    medio: {
      barberia: {
        titulo: "Tu corte está perdiendo forma ✂️",
        cuerpo: `Hola <strong>${nombre}</strong>,<br><br>Hace un tiempo que no pasas por <strong>${nombreEmpresa}</strong> y tu <strong>${servicio.nombre}</strong> ya lo nota 👀<br>Agéndate antes de que el pelo mande. 😄`
      },
      salon_belleza: {
        titulo: "Ya es momento de un retoque 💅",
        cuerpo: `Hola <strong>${nombre}</strong>,<br><br>Tu <strong>${servicio.nombre}</strong> en <strong>${nombreEmpresa}</strong> ya está pidiendo atención ✨<br>Reserva tu hora y vuelve a brillar.`
      },
      default: {
        titulo: "Te echamos de menos 💫",
        cuerpo: `Hola <strong>${nombre}</strong>,<br><br>Hace un tiempo que no te vemos en <strong>${nombreEmpresa}</strong>.<br>Tu <strong>${servicio.nombre}</strong> te está esperando. 😊`
      }
    },
    fiel: {
      barberia: {
        titulo: `Ya es hora, ${nombre} ✂️`,
        cuerpo: `Hola <strong>${nombre}</strong>,<br><br>Conocemos tu ritmo y sabemos que ya es momento del <strong>${servicio.nombre}</strong> en <strong>${nombreEmpresa}</strong>.<br>Reserva y llega como siempre: con estilo. 💈`
      },
      salon_belleza: {
        titulo: `Tu cita te está esperando, ${nombre} ✨`,
        cuerpo: `Hola <strong>${nombre}</strong>,<br><br>Sabemos que eres de las que no deja pasar mucho tiempo 😄<br>Ya es momento de tu <strong>${servicio.nombre}</strong> en <strong>${nombreEmpresa}</strong>. ¡Te esperamos!`
      },
      default: {
        titulo: "Ya es momento de tu próxima visita 🗓️",
        cuerpo: `Hola <strong>${nombre}</strong>,<br><br>Según tu historial en <strong>${nombreEmpresa}</strong>, ya es buen momento para agendar tu <strong>${servicio.nombre}</strong>.<br>Reserva cuando quieras.`
      }
    }
  };

  // ---- SELECTOR ----
  const nivel = tipoCliente === "nuevo" ? "nuevo" : tipoCliente === "medio" ? "medio" : "fiel";
  const grupo = mensajes[nivel];

  return grupo[tipo] ?? grupo["default"];
};