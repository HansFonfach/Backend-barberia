import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const sendBaseEmail = async ({ to, subject, html }) => {
  return await resend.emails.send({
    from: "Barbería <no-reply@agendafonfach.cl>",
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

  return await sendBaseEmail({
    to,
    subject: "✔️ Tu reserva ha sido confirmada",
    html,
  });
};

export const sendGuestReservationEmail = async (to, data) => {
  const { nombreCliente, nombreBarbero, fecha, hora, servicio, cancelUrl } = data;

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
    <p>❌ Si necesitas cancelar tu reserva, puedes hacerlo desde el siguiente enlace:</p>
    <p>
      <a href="${cancelUrl}" target="_blank" style="display:inline-block;padding:12px 18px;background:#dc3545;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">
        ❌ Cancelar mi reserva
      </a>
    </p>
    <p style="color:#555">⏰ Puedes cancelar esta reserva hasta <b>3 horas antes</b> del horario agendado.</p>
    <small>Este enlace es personal y expira automáticamente.</small>
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

  return await sendBaseEmail({
    to,
    subject: "✔️ Tu reserva ha sido cancelada",
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

  return await sendBaseEmail({
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
    <p>Tu pago de suscripción ha sido procesado y acreditado correctamente.</p>
    <h3>Detalles de la suscripción</h3>
    <ul>
      <li><strong>Fecha de activación:</strong> ${fechaInicio}</li>
      <li><strong>Válida hasta:</strong> ${fechaFin}</li>
    </ul>
    <p>Desde ahora puedes disfrutar de todos los beneficios de tu plan.</p>
    <p>Atentamente,<br/><strong>Equipo La Santa Barbería</strong></p>
  `;

  return await sendBaseEmail({
    to,
    subject: "✅ Pago confirmado",
    html,
  });
};