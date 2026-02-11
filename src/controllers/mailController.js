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
export const sendBaseEmail = async ({ to, subject, html }) => {
  return await transporter.sendMail({
    from: `"Barbería" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
};

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

export const sendGuestReservationEmail = async (to, data) => {
  const { nombreCliente, nombreBarbero, fecha, hora, servicio, cancelUrl } =
    data;

  const html = `
    <h2>Reserva Confirmada 💈</h2>
    <p>Hola <strong>${nombreCliente}</strong>,</p>

    <p>Tu reserva fue creada exitosamente.</p>

    <h3>Detalles:</h3>
    <ul>
      <li><strong>Barbero:</strong> ${nombreBarbero}</li>
      <li><strong>Servicio:</strong> ${servicio}</li>
      <li><strong>Fecha:</strong> ${fecha}</li>
      <li><strong>Hora:</strong> ${hora}</li>
    </ul>

    <p>
      ❌ Si necesitas cancelar tu reserva, puedes hacerlo desde el siguiente enlace:
    </p>

    <p>
      <a href="${cancelUrl}" target="_blank">
        Cancelar mi reserva
      </a>
    </p>

    <p style="color:#555">
  ⏰ Puedes cancelar esta reserva hasta <b>30 minutos antes</b> del horario agendado.
</p>

    <small>
      Este enlace es personal y expira automáticamente.
    </small>
  `;

  return await sendBaseEmail({
    to,
    subject: "✔️ Reserva confirmada – La Santa Barbería",
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

export const sendSuscriptionActiveEmail = async (to, data) => {
  const { nombreCliente, fechaInicio, fechaFin } = data;

  const html = `
  <h2>Suscripción confirmada</h2>

  <p>Estimado/a <strong>${nombreCliente}</strong>,</p>

  <p>
    Queremos agradecerte por confiar en nosotros. Te confirmamos que el pago de tu
    <strong>suscripción</strong> ha sido procesado y acreditado correctamente.
  </p>

  <h3>Detalles de la suscripción</h3>
  <ul>
    <li><strong>Fecha de activación:</strong> ${fechaInicio}</li>
    <li><strong>Válida hasta:</strong> ${fechaFin}</li>
  </ul>

  <p>
    Desde ahora puedes disfrutar de todos los beneficios asociados a tu plan y
    gestionar tus reservas directamente desde la plataforma.
  </p>

  <p>
    Si tienes alguna duda o necesitas asistencia, no dudes en contactarnos.
    Estaremos encantados de ayudarte.
  </p>

  <p>
    Atentamente,<br />
    <strong>Equipo La Santa Barberia</strong>
  </p>
`;

  return await transporter.sendMail({
    from: `"Barbería" <${process.env.EMAIL_USER}>`,
    to,
    subject: "¡ ✅ Pago confirmado !",
    html,
  });
};
