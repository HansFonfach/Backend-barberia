import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendReservationEmail = async (to, data) => {
  const { nombreCliente, nombreBarbero, fecha, hora, servicio } = data;

  const html = `
    <h2>Reserva Confirmada ✂️</h2>
    <p>Hola <strong>${nombreCliente}</strong>, tu reserva ha sido confirmada.</p>
    
    <h3>Detalles de tu reserva:</h3>
    <ul>
      <li><strong>Barbero:</strong> ${nombreBarbero}</li>
      <li><strong>Servicio:</strong> ${servicio}</li>
      <li><strong>Fecha:</strong> ${fecha}</li>
      <li><strong>Hora:</strong> ${hora}</li>
    </ul>

    <p>Si necesitas cancelar o reagendar, ingresa a tu perfil o contáctanos.</p>
  `;

  return await transporter.sendMail({
    from: `"Barbería" <${process.env.EMAIL_USER}>`,
    to,
    subject: "✔️ Tu reserva ha sido confirmada",
    html,
  });
};

export const sendCancelReservationEmail = async (to, data) => {
  const { nombreCliente, nombreBarbero, fecha, hora, servicio } = data;

  const html = `
    <h2>Reserva Cancelada ✂️</h2>
    <p>Hola <strong>${nombreCliente}</strong>, tu reserva ha sido cancelada.</p>
    
    <h3>Detalles de tu reserva:</h3>
    <ul>
      <li><strong>Barbero:</strong> ${nombreBarbero}</li>
      <li><strong>Servicio:</strong> ${servicio}</li>
      <li><strong>Fecha:</strong> ${fecha}</li>
      <li><strong>Hora:</strong> ${hora}</li>
    </ul>

    <p>Si necesitas agendar nuevamente, ingresa a tu perfil o contáctanos.</p>
  `;

  return await transporter.sendMail({
    from: `"Barbería" <${process.env.EMAIL_USER}>`,
    to,
    subject: "✔️ Tu reserva ha sido cancelada ",
    html,
  });
};

export const sendWaitlistNotificationEmail = async (to, data) => {
  const { nombreCliente, nombreBarbero, fecha, hora } = data;

  const html = `
    <h2>Hora disponible ✂️</h2>
    <p>Hola <strong>${nombreCliente}</strong>, se ha liberado una hora que seleccionaste en tu lista de espera.</p>
    
    <h3>Detalles de la hora disponible:</h3>
    <ul>
      <li><strong>Barbero:</strong> ${nombreBarbero}</li>
      <li><strong>Fecha:</strong> ${fecha}</li>
      <li><strong>Hora:</strong> ${hora}</li>
    </ul>

    <p>Si deseas reservarla, ingresa a la plataforma lo antes posible, ¡las horas se llenan rápido!</p>
  `;

  return await transporter.sendMail({
    from: `"Barbería" <${process.env.EMAIL_USER}>`,
    to,
    subject: "⌛ Se liberó una hora con tu barbero",
    html,
  });
};
