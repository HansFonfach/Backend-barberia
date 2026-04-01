import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendBaseEmail = async ({ to, subject, html, text }) => {
  return await resend.emails.send({
    from: "Agenda Fonfach <no-reply@agendafonfach.cl>",
    to,
    subject,
    html,
    text, // ← NUEVO: versión texto plano, reduce spam score
  });
};

// ← NUEVO: botón sin target="_blank" (Apple Mail lo bloqueaba)
const ctaButton = (href, label, color = "#1a73e8") => `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="padding:16px 0;">
          <a href="${href}"
            style="display:inline-block;padding:12px 24px;background-color:${color};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-family:Arial,sans-serif;font-size:15px;">
            ${label}
          </a>
        </td>
      </tr>
      <tr>
        <td align="center">
          <p style="font-size:12px;color:#888;font-family:Arial,sans-serif;">
            O copia este enlace en tu navegador:<br/>
            <a href="${href}" style="color:#1a73e8;word-break:break-all;">${href}</a>
          </p>
        </td>
      </tr>
    </table>
  `;

const layout = (body) => `
  <!DOCTYPE html>
  <html lang="es">
  <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f5f5">
      <tr><td align="center" style="padding:32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff"
              style="border-radius:8px;max-width:600px;width:100%;">
          <tr>
            <td style="background:#1a1a1a;padding:20px 32px;">
              <p style="margin:0;color:#fff;font-size:20px;font-weight:bold;">🗓️Agenda Fonfach</p>
            </td>
          </tr>
          <tr><td style="padding:32px;">${body}</td></tr>
          <tr>
            <td style="background:#f0f0f0;padding:16px 32px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#888;">© Agenda Fonfach · agendafonfach.cl</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
  </html>`;

const detalles = ({
  nombreBarbero,
  servicio,
  fecha,
  hora,
  direccion,
  labelProfesional = "Profesional",
}) => `
    <table cellpadding="8" cellspacing="0" border="0" width="100%"
          style="background:#f9f9f9;border-radius:6px;margin:16px 0;">
      <tr><td style="font-size:14px;color:#555;width:40%;">${labelProfesional}</td><td style="font-weight:bold;">${nombreBarbero}</td></tr>
      <tr><td style="font-size:14px;color:#555;">Servicio</td><td style="font-weight:bold;">${servicio}</td></tr>
      <tr><td style="font-size:14px;color:#555;">Fecha</td><td style="font-weight:bold;">${fecha}</td></tr>
      <tr><td style="font-size:14px;color:#555;">Hora</td><td style="font-weight:bold;">${hora}</td></tr>
      <tr><td style="font-size:14px;color:#555;">Dirección</td><td style="font-weight:bold;">${direccion}</td></tr>
    </table>`;

export const sendReservationEmail = async (to, data) => {
  const {
    nombreCliente,
    nombreBarbero,
    fecha,
    hora,
    servicio,
    instrucciones,
    direccion,
    horasLimite, // ← nuevo
    telefonoEmpresa, // ← nuevo
  } = data;
  return await sendBaseEmail({
    to,
    subject: "Reserva confirmada – Agenda Fonfach",
    html: layout(`
        <h2 style="margin-top:0;">Reserva Confirmada 🗓️</h2>
        <p>Hola <strong>${nombreCliente}</strong>, tu reserva ha sido confirmada.</p>
        ${detalles({ nombreBarbero, servicio, fecha, hora, direccion })}

        ${
          instrucciones
            ? `
          <div style="background:#fff8f0;border-left:4px solid #f0a500;padding:16px;border-radius:4px;margin:16px 0;">
            <p style="margin:0 0 8px;font-weight:bold;color:#555;">📋 Instrucciones para tu cita:</p>
            <p style="margin:0;color:#555;font-size:14px;white-space:pre-line;text-align:justify;">${instrucciones}</p>
          </div>
        `
            : ""
        }

        ${
          horasLimite != null
            ? `
          <div style="background:#f0f7ff;border-left:4px solid #1a73e8;padding:16px;border-radius:4px;margin:16px 0;">
            <p style="margin:0;color:#555;font-size:14px;line-height:1.6;">
              ⚠️ Cancelaciones con al menos <strong>${horasLimite} hora${horasLimite !== 1 ? "s" : ""} de anticipación</strong>.
              ${telefonoEmpresa ? `¿Algún imprevisto? Contáctate con tu profesional: 📞 <a href="tel:${telefonoEmpresa}" style="color:#1a73e8;font-weight:bold;text-decoration:none;">${telefonoEmpresa}</a>` : ""}
            </p>
          </div>
        `
            : ""
        }

        <p style="color:#555;font-size:14px;">Si necesitas cancelar o reagendar, ingresa a tu perfil.</p>
      `),
    text: `Reserva confirmada\n\nHola ${nombreCliente}\n\nProfesional: ${nombreBarbero}\nServicio: ${servicio}\nFecha: ${fecha}\nHora: ${hora}\nDirección: ${direccion ?? "No especificada"}${instrucciones ? `\n\nInstrucciones:\n${instrucciones}` : ""}${horasLimite != null ? `\n\n⚠️ Cancelaciones con al menos ${horasLimite} hora${horasLimite !== 1 ? "s" : ""} de anticipación.${telefonoEmpresa ? ` ¿Algún imprevisto? Contáctate con tu profesional: ${telefonoEmpresa}` : ""}` : ""}`,
  });
};

export const sendGuestReservationEmail = async (to, data) => {
  const {
    nombreCliente,
    nombreBarbero,
    fecha,
    hora,
    servicio,
    cancelUrl,
    instrucciones,
    permiteCancelacion, // ✅ nuevo
    horasLimite, // ✅ nuevo
    direccion,
    telefonoEmpresa, // ← nuevo
  } = data;

  return await sendBaseEmail({
    to,
    subject: "Reserva confirmada – Agenda Fonfach",
    html: layout(`
        <h2 style="margin-top:0;">Reserva Confirmada 🗓️</h2>
        <p>Hola <strong>${nombreCliente}</strong>, tu reserva fue creada exitosamente.</p>
        ${detalles({ nombreBarbero, servicio, fecha, hora, direccion })}

        ${
          instrucciones
            ? `
          <div style="background:#fff8f0;border-left:4px solid #f0a500;padding:16px;border-radius:4px;margin:16px 0;">
            <p style="margin:0 0 8px;font-weight:bold;color:#555;">📋 Instrucciones para tu cita:</p>
            <p style="margin:0;color:#555;font-size:14px;white-space:pre-line;text-align:justify;">${instrucciones}</p>
          </div>
        `
            : ""
        }

        ${
          permiteCancelacion && cancelUrl
            ? `
        
          ${ctaButton(cancelUrl, "Cancelar mi reserva", "#c0392b")}
          <p style="font-size:12px;color:#aaa;">Este enlace es personal y expira automáticamente.</p>
        `
            : `
          <p style="color:#555;font-size:14px;">Esta reserva no admite cancelaciones.</p>
        `
        }
        ${
          horasLimite != null
            ? `
  <div style="background:#f0f7ff;border-left:4px solid #1a73e8;padding:16px;border-radius:4px;margin:16px 0;">
    <p style="margin:0;color:#555;font-size:14px;line-height:1.6;">
      ⚠️ Cancelaciones con al menos <strong>${horasLimite} hora${horasLimite !== 1 ? "s" : ""} de anticipación</strong>.
      ${telefonoEmpresa ? `¿Algún imprevisto? Contáctate con tu profesional: 📞 <a href="tel:${telefonoEmpresa}" style="color:#1a73e8;font-weight:bold;text-decoration:none;">${telefonoEmpresa}</a>` : ""}
    </p>
  </div>
`
            : ""
        }
      `),
    text: `Reserva confirmada\n\nHola ${nombreCliente}\n\nProfesional: ${nombreBarbero}\nServicio: ${servicio}\nFecha: ${fecha}\nHora: ${hora}${instrucciones ? `\n\nInstrucciones:\n${instrucciones}` : ""}${permiteCancelacion && cancelUrl ? `\n\nCancelar reserva (hasta ${horasLimite}h antes):\n${cancelUrl}` : "\n\nEsta reserva no admite cancelaciones."}`,
  });
};

export const sendCancelReservationEmail = async (to, data) => {
  const {
    nombreCliente,
    nombreBarbero,
    fecha,
    hora,
    servicio,
    motivo,
    direccion,
  } = data;
  return await sendBaseEmail({
    to,
    subject: "Tu reserva ha sido cancelada – Agenda Fonfach",
    html: layout(`
        <h2 style="margin-top:0;">Reserva Cancelada</h2>
        <p>Hola <strong>${nombreCliente}</strong>, tu reserva ha sido cancelada correctamente.</p>
        ${motivo ? `<p><strong>Motivo:</strong> ${motivo}</p>` : ""}
        ${detalles({ nombreBarbero, servicio, fecha, hora, direccion })}
      `),
    text: `Reserva cancelada\n\nHola ${nombreCliente}\n\nProfesional: ${nombreBarbero}\nServicio: ${servicio}\nFecha: ${fecha}\nHora: ${hora}${motivo ? `\nMotivo: ${motivo}` : ""}`,
  });
};

export const sendWaitlistNotificationEmail = async (to, data) => {
  const { nombreCliente, nombreBarbero, fecha, hora } = data;
  return await sendBaseEmail({
    to,
    subject: "Se liberó una hora que querías – Agenda Fonfach",
    html: layout(`
        <h2 style="margin-top:0;">Se liberó una hora 🗓️</h2>
        <p>Hola <strong>${nombreCliente}</strong>, se liberó una hora de tu lista de espera.</p>
        <table cellpadding="8" cellspacing="0" border="0" width="100%"
              style="background:#f9f9f9;border-radius:6px;margin:16px 0;">
          <tr><td style="font-size:14px;color:#555;width:40%;">Profesional</td><td style="font-weight:bold;">${nombreBarbero}</td></tr>
          <tr><td style="font-size:14px;color:#555;">Fecha</td><td style="font-weight:bold;">${fecha}</td></tr>
          <tr><td style="font-size:14px;color:#555;">Hora</td><td style="font-weight:bold;">${hora}</td></tr>
        </table>
        <p style="color:#555;font-size:14px;">Ingresa a la plataforma lo antes posible. ¡Las horas se llenan rápido!</p>
      `),
    text: `Hora disponible\n\nHola ${nombreCliente}\n\nProfesional: ${nombreBarbero}\nFecha: ${fecha}\nHora: ${hora}\n\nIngresa a la plataforma lo antes posible.`,
  });
};

export const sendSuscriptionActiveEmail = async (to, data) => {
  const { nombreCliente, fechaInicio, fechaFin } = data;
  return await sendBaseEmail({
    to,
    subject: "Suscripción confirmada – Agenda Fonfach",
    html: layout(`
        <h2 style="margin-top:0;">Suscripción confirmada</h2>
        <p>Estimado/a <strong>${nombreCliente}</strong>, tu pago fue procesado correctamente.</p>
        <table cellpadding="8" cellspacing="0" border="0" width="100%"
              style="background:#f9f9f9;border-radius:6px;margin:16px 0;">
          <tr><td style="font-size:14px;color:#555;width:50%;">Activación</td><td style="font-weight:bold;">${fechaInicio}</td></tr>
          <tr><td style="font-size:14px;color:#555;">Válida hasta</td><td style="font-weight:bold;">${fechaFin}</td></tr>
        </table>
        <p style="color:#555;font-size:14px;">Atentamente,<br/><strong>Equipo 🗓️ Agenda Fonfach</strong></p>
      `),
    text: `Suscripción confirmada\n\nEstimado/a ${nombreCliente}\n\nActivación: ${fechaInicio}\nVálida hasta: ${fechaFin}\n\nEquipo 🗓️ Agenda Fonfach`,
  });
};

export const sendClaimAccountEmail = async (to, data) => {
  const { nombreCliente, claimUrl } = data;
  return await sendBaseEmail({
    to,
    subject: "Activa tu cuenta – Agenda Fonfach",
    html: layout(`
        <h2 style="margin-top:0;">Activa tu cuenta</h2>
        <p>Hola <strong>${nombreCliente}</strong>,</p>
        <p>Recibimos una solicitud para crear una cuenta con tu RUT. Si fuiste tú, activa tu cuenta aquí:</p>
        ${ctaButton(claimUrl, "Activar mi cuenta", "#2e7d32")}
        <p style="color:#555;font-size:14px;">⏰ Este enlace expira en <strong>1 hora</strong>.</p>
        <p style="color:#aaa;font-size:13px;">Si no fuiste tú, ignora este correo.</p>
      `),
    text: `Activa tu cuenta\n\nHola ${nombreCliente}\n\nActiva tu cuenta aquí (expira en 1 hora):\n${claimUrl}\n\nSi no fuiste tú, ignora este correo.`,
  });
};

export const sendReminderEmail = async (to, data) => {
  const {
    nombreCliente,
    nombreBarbero,
    servicio,
    fecha,
    hora,
    tipo,
    instrucciones,
    direccion,
    confirmarUrl,
    cancelarUrl,
    horasLimite, // ← nuevo: horas que permite la empresa para cancelar
    telefonoEmpresa, // ← nuevo: número del profesional
  } = data;

  const es24h = tipo === "24h";

  return await sendBaseEmail({
    to,
    subject: es24h
      ? "Recordatorio: tu cita es mañana – Agenda Fonfach"
      : "Recordatorio: tu cita es en 3 horas – Agenda Fonfach",
    html: layout(`
      <h2 style="margin-top:0;">
        ${es24h ? "⏰ Tu cita es mañana" : "⏰ Tu cita es en 3 horas"}
      </h2>
      <p>Hola <strong>${nombreCliente}</strong>, te recordamos que tienes una cita agendada.</p>
      ${detalles({ nombreBarbero, servicio, fecha, hora, direccion })}

      ${
        instrucciones
          ? `
        <div style="background:#fff8f0;border-left:4px solid #f0a500;padding:16px;border-radius:4px;margin:16px 0;">
          <p style="margin:0 0 8px;font-weight:bold;color:#555;">📋 Instrucciones para tu cita:</p>
          <p style="margin:0;color:#555;font-size:14px;white-space:pre-line;text-align:justify;">${instrucciones}</p>
        </div>
      `
          : ""
      }

  ${
    horasLimite != null
      ? `
  <div style="background:#f0f7ff;border-left:4px solid #1a73e8;padding:16px;border-radius:4px;margin:16px 0;">
    <p style="margin:0;color:#555;font-size:14px;line-height:1.6;">
      ⚠️ Cancelaciones con al menos <strong>${horasLimite} hora${horasLimite !== 1 ? "s" : ""} de anticipación</strong>.
      ${
        telefonoEmpresa
          ? `¿Algún imprevisto? Contáctate con tu profesional: 📞 <a href="tel:${telefonoEmpresa}" style="color:#1a73e8;font-weight:bold;text-decoration:none;">${telefonoEmpresa}</a>`
          : ""
      }
    </p>
  </div>
`
      : ""
  }

      ${
        es24h && confirmarUrl && cancelarUrl
          ? `
        <p style="color:#555;font-size:14px;margin-top:24px;">
          ¿Podrás asistir? Confirma o cancela con un clic:
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="50%" style="padding:0 8px 0 0;">
              ${ctaButton(confirmarUrl, "✅ Sí, voy a ir", "#2e7d32")}
            </td>
            <td width="50%" style="padding:0 0 0 8px;">
              ${ctaButton(cancelarUrl, "❌ No podré ir", "#c0392b")}
            </td>
          </tr>
        </table>
        <p style="font-size:12px;color:#aaa;text-align:center;">
          Este enlace es personal y expira automáticamente.
        </p>
      `
          : `
        <p style="color:#555;font-size:14px;">
          Si necesitas cancelar, hazlo desde tu perfil.
        </p>
      `
      }
    `),
    text: `Recordatorio de cita\n\nHola ${nombreCliente}\n\nProfesional: ${nombreBarbero}\nServicio: ${servicio}\nFecha: ${fecha}\nHora: ${hora}${instrucciones ? `\n\nInstrucciones:\n${instrucciones}` : ""}${horasLimite != null ? `\n\nRecuerda que tu reserva se puede cancelar hasta solo ${horasLimite} hora${horasLimite !== 1 ? "s" : ""} antes de tu cita.${telefonoEmpresa ? ` Ante cualquier eventualidad, comunícate con el/la profesional al ${telefonoEmpresa}.` : ""}` : ""}${es24h && confirmarUrl ? `\n\nConfirmar asistencia: ${confirmarUrl}\nCancelar: ${cancelarUrl}` : ""}`,
  });
};

export const sendProfesionalNewReservationEmail = async (to, data) => {
  const { nombreCliente, nombreBarbero, fecha, hora, servicio, direccion } =
    data;
  return await sendBaseEmail({
    to,
    subject: "Nueva reserva recibida – Agenda Fonfach",
    html: layout(`
        <h2 style="margin-top:0;">Nueva Reserva 🗓️</h2>
        <p>Hola <strong>${nombreBarbero}</strong>, tienes una nueva reserva.</p>
        ${detalles({ nombreBarbero: nombreCliente, servicio, fecha, hora, direccion, labelProfesional: "Cliente" })}
      `),
    text: `Nueva reserva\n\nHola ${nombreBarbero}\n\nCliente: ${nombreCliente}\nServicio: ${servicio}\nFecha: ${fecha}\nHora: ${hora} \nDirección: ${direccion}`,
  });
};

export const sendProfesionalCancelReservationEmail = async (to, data) => {
  const { nombreCliente, nombreBarbero, fecha, hora, servicio, direccion } =
    data;
  return await sendBaseEmail({
    to,
    subject: "Reserva cancelada – Agenda Fonfach",
    html: layout(`
        <h2 style="margin-top:0;">Reserva Cancelada</h2>
        <p>Hola <strong>${nombreBarbero}</strong>, una reserva ha sido cancelada.</p>
      ${detalles({ nombreBarbero: nombreCliente, servicio, fecha, hora, direccion, labelProfesional: "Cliente" })}
      `),
    text: `Nueva reserva\n\nHola ${nombreBarbero}\n\nCliente: ${nombreCliente}\nServicio: ${servicio}\nFecha: ${fecha}\nHora: ${hora}\nDirección: ${direccion ?? "No especificada"}`,
  });
};

export const sendRetentionEmail = async (to, data) => {
  const { titulo, cuerpo, nombreEmpresa } = data;

  return await sendBaseEmail({
    to,
    subject: `${titulo} – ${nombreEmpresa || "Agenda Fonfach"}`,
    html: layout(`
        <h2 style="margin-top:0;">${titulo}</h2>
        <p style="color:#555;font-size:15px;line-height:1.7;">${cuerpo}</p>
        <p style="color:#aaa;font-size:12px;margin-top:32px;">
          Este recordatorio fue enviado por <strong>${nombreEmpresa || "Agenda Fonfach"}</strong>.
        </p>
      `),
    text: `${titulo}\n\n${cuerpo.replace(/<[^>]*>/g, "")}`,
  });
};

export const sendBienvenidaEmpresaEmail = async (to, data) => {
  const { nombreNegocio, slug, email, password } = data;
  const panelUrl = `https://www.agendafonfach.cl/admin/login`;
  const agendaUrl = `https://www.agendafonfach.cl/${slug}`;

  return await sendBaseEmail({
    to,
    subject: "¡Tu negocio está listo! – Agenda Fonfach",
    html: layout(`
        <h2 style="margin-top:0;">¡Bienvenido a Agenda Fonfach! 🎉</h2>
        <p>Tu negocio <strong>${nombreNegocio}</strong> fue creado exitosamente. Tienes <strong>7 días gratis</strong> para probarlo sin límites.</p>

        <table cellpadding="8" cellspacing="0" border="0" width="100%"
              style="background:#f9f9f9;border-radius:6px;margin:16px 0;">
          <tr>
            <td style="font-size:14px;color:#555;width:40%;">Tu agenda pública</td>
            <td style="font-weight:bold;">
              <a href="${agendaUrl}" style="color:#4361ee;">${agendaUrl}</a>
            </td>
          </tr>
          <tr>
            <td style="font-size:14px;color:#555;">Correo</td>
            <td style="font-weight:bold;">${email}</td>
          </tr>
          <tr>
            <td style="font-size:14px;color:#555;">Contraseña temporal</td>
            <td style="font-weight:bold;letter-spacing:2px;">${password}</td>
          </tr>
        </table>

        <div style="background:#fff8f0;border-left:4px solid #f0a500;padding:16px;border-radius:4px;margin:16px 0;">
          <p style="margin:0;font-size:14px;color:#555;">
            🔒 Por seguridad, te recomendamos cambiar tu contraseña después de iniciar sesión por primera vez.
          </p>
        </div>

        ${ctaButton(panelUrl, "Ir a mi panel de administración", "#4361ee")}

        <p style="color:#555;font-size:14px;">
          Si tienes alguna duda, responde este correo o escríbenos por WhatsApp. Estamos para ayudarte.
        </p>
        <p style="color:#555;font-size:14px;">
          Atentamente,<br/><strong>Equipo 🗓️ Agenda Fonfach</strong>
        </p>
      `),
    text: `¡Bienvenido a Agenda Fonfach!\n\nTu negocio "${nombreNegocio}" fue creado exitosamente. Tienes 7 días gratis para probarlo.\n\nTu agenda pública: ${agendaUrl}\nCorreo: ${email}\nContraseña temporal: ${password}\n\nInicia sesión en: ${panelUrl}\n\nTe recomendamos cambiar tu contraseña después del primer ingreso.\n\nEquipo 🗓️ Agenda Fonfach`,
  });
};
