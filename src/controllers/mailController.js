import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendBaseEmail = async ({ to, subject, html, text }) => {
  const result = await resend.emails.send({
    from: "Agenda Fonfach <onboarding@resend.dev>",
    to,
    subject,
    html,
    text,
  });

  return result;
};

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
              <p style="margin:0;color:#fff;font-size:20px;font-weight:bold;">🗓️ Agenda Fonfach</p>
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
    <tr><td style="font-size:14px;color:#555;">Dirección</td><td style="font-weight:bold;">${direccion ?? "No especificada"}</td></tr>
  </table>`;

// Bloque reutilizable: instrucciones del servicio
const bloqueInstrucciones = (instrucciones) =>
  instrucciones
    ? `
  <div style="background:#fff8f0;border-left:4px solid #f0a500;padding:16px;border-radius:4px;margin:16px 0;">
    <p style="margin:0 0 8px;font-weight:bold;color:#555;">📋 Instrucciones para tu cita:</p>
    <p style="margin:0;color:#555;font-size:14px;white-space:pre-line;text-align:justify;">${instrucciones}</p>
  </div>`
    : "";
//bloque cuidados: instrucciones de cuidados posterior a la cita
const bloqueCuidados = (cuidados) =>
  cuidados
    ? `
  <div style="background:#f0fff4;border-left:4px solid #28a745;padding:16px;border-radius:4px;margin:16px 0;">
    <p style="margin:0 0 8px;font-weight:bold;color:#2d6a4f;">
      🌿 Cuidados posteriores a tu servicio:
    </p>
    <p style="margin:0;color:#555;font-size:14px;white-space:pre-line;text-align:justify;">
      ${cuidados}
    </p>
  </div>`
    : "";

// Bloque reutilizable: política de cancelación
const bloquePolitica = ({
  horasLimite,
  telefonoEmpresa,
  mensajeCancelacionRecordatorio,
}) => {
  // Si hay mensaje personalizado, lo mostramos en lugar de la política genérica
  if (mensajeCancelacionRecordatorio) {
    return `
  <div style="background:#fff8f0;border-left:4px solid #f0a500;padding:16px;border-radius:4px;margin:16px 0;">
    <p style="margin:0;color:#555;font-size:14px;line-height:1.6;white-space:pre-line;">${mensajeCancelacionRecordatorio}</p>
  </div>`;
  }

  if (horasLimite == null) return "";

  return `
  <div style="background:#f0f7ff;border-left:4px solid #1a73e8;padding:16px;border-radius:4px;margin:16px 0;">
    <p style="margin:0;color:#555;font-size:14px;line-height:1.6;">
      ⚠️ Puedes cancelar tu cita con al menos <strong>${horasLimite} hora${horasLimite !== 1 ? "s" : ""} de anticipación</strong>.
      ${telefonoEmpresa ? `¿Algún imprevisto? Contáctate con tu profesional: 📞 <a href="tel:${telefonoEmpresa}" style="color:#1a73e8;font-weight:bold;text-decoration:none;">${telefonoEmpresa}</a>` : ""}
    </p>
  </div>`;
};

// ─────────────────────────────────────────────
// EMAIL: Reserva confirmada (usuario registrado)
// ─────────────────────────────────────────────
export const sendReservationEmail = async (to, data) => {
  const {
    nombreCliente,
    nombreBarbero,
    fecha,
    hora,
    servicio,
    direccion,
    instrucciones,
    requiereAbono,
    montoAbono,
    datosPago,
  } = data;

  const bloqueAbono = requiereAbono
    ? `
      <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:16px;margin-top:16px;">
        <p style="margin:0 0 8px;"><strong>Debes transferir $${montoAbono.toLocaleString("es-CL")} para confirmar tu reserva.</strong></p>
        <p style="margin:0;">Banco: ${datosPago.banco}<br/>
        Tipo de cuenta: ${datosPago.tipoCuenta}<br/>
        N° cuenta: ${datosPago.numeroCuenta}<br/>
        Titular: ${datosPago.titular}<br/>
        RUT: ${datosPago.rut}<br/>
        Correo: ${datosPago.correo}</p>
      </div>
    `
    : "";

  return await sendBaseEmail({
    to,
    subject: "Reserva confirmada – Agenda Fonfach",
    html: layout(`
        <h2 style="margin-top:0;">¡Tu reserva está lista! ✅</h2>
        <p>Hola <strong>${nombreCliente}</strong>, tu hora con ${nombreBarbero} fue agendada.</p>
        ${detalles({ nombreBarbero, servicio, fecha, hora, direccion })}
        ${bloqueAbono}
      `),
    text: `Reserva confirmada\n\nHola ${nombreCliente}\n\nProfesional: ${nombreBarbero}\nServicio: ${servicio}\nFecha: ${fecha}\nHora: ${hora}\nDirección: ${direccion}${
      requiereAbono
        ? `\n\nDebes transferir $${montoAbono.toLocaleString("es-CL")} para confirmar tu reserva.\nBanco: ${datosPago.banco}\nCuenta: ${datosPago.numeroCuenta}\nTitular: ${datosPago.titular}\nRUT: ${datosPago.rut}`
        : ""
    }`,
  });
};

// ─────────────────────────────────────────────
// EMAIL: Reserva confirmada (invitado/sin cuenta)
// ─────────────────────────────────────────────
export const sendGuestReservationEmail = async (to, data) => {
  const {
    nombreCliente,
    nombreBarbero,
    fecha,
    hora,
    servicio,
    cancelUrl,
    instrucciones,
    permiteCancelacion,
    horasLimite,
    direccion,
    telefonoEmpresa,
    mensajeCancelacionRecordatorio,
  } = data;

  return await sendBaseEmail({
    to,
    subject: "Reserva confirmada – Agenda Fonfach",
    html: layout(`
      <h2 style="margin-top:0;">Reserva Confirmada 🗓️</h2>
      <p>Hola <strong>${nombreCliente}</strong>, tu reserva fue creada exitosamente.</p>
      ${detalles({ nombreBarbero, servicio, fecha, hora, direccion })}
      ${bloqueInstrucciones(instrucciones)}
      ${bloquePolitica({ horasLimite, telefonoEmpresa, mensajeCancelacionRecordatorio })}
      ${
        permiteCancelacion && cancelUrl && !mensajeCancelacionRecordatorio
          ? `
        ${ctaButton(cancelUrl, "Cancelar mi reserva", "#c0392b")}
        <p style="font-size:12px;color:#aaa;text-align:center;">Este enlace es personal y expira automáticamente.</p>
      `
          : !permiteCancelacion
            ? `<p style="color:#555;font-size:14px;">Esta reserva no admite cancelaciones.</p>`
            : ""
      }
    `),
    text: `Reserva confirmada\n\nHola ${nombreCliente}\n\nProfesional: ${nombreBarbero}\nServicio: ${servicio}\nFecha: ${fecha}\nHora: ${hora}\nDirección: ${direccion ?? "No especificada"}${instrucciones ? `\n\nInstrucciones:\n${instrucciones}` : ""}${mensajeCancelacionRecordatorio ? `\n\n${mensajeCancelacionRecordatorio}` : horasLimite != null ? `\n\n⚠️ Puedes cancelar con al menos ${horasLimite} hora${horasLimite !== 1 ? "s" : ""} de anticipación.${telefonoEmpresa ? ` Contáctate con tu profesional: ${telefonoEmpresa}` : ""}` : ""}${permiteCancelacion && cancelUrl && !mensajeCancelacionRecordatorio ? `\n\nCancelar reserva:\n${cancelUrl}` : !permiteCancelacion ? "\n\nEsta reserva no admite cancelaciones." : ""}`,
  });
};

// ─────────────────────────────────────────────
// EMAIL: Recordatorio de cita
// ─────────────────────────────────────────────
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
    horasLimite,
    telefonoEmpresa,
    mensajeCancelacionRecordatorio,
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
      ${bloqueInstrucciones(instrucciones)}

      ${
        es24h && confirmarUrl && cancelarUrl
          ? mensajeCancelacionRecordatorio
            ? bloquePolitica({ mensajeCancelacionRecordatorio })
            : `
          <p style="color:#555;font-size:14px;margin-top:24px;">¿Podrás asistir? Confirma o cancela con un clic:</p>
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
          <p style="font-size:12px;color:#aaa;text-align:center;">Este enlace es personal y expira automáticamente.</p>
          ${bloquePolitica({ horasLimite, telefonoEmpresa })}
        `
          : bloquePolitica({ horasLimite, telefonoEmpresa })
      }
    `),
    text: `Recordatorio de cita\n\nHola ${nombreCliente}\n\nProfesional: ${nombreBarbero}\nServicio: ${servicio}\nFecha: ${fecha}\nHora: ${hora}\nDirección: ${direccion ?? "No especificada"}${instrucciones ? `\n\nInstrucciones:\n${instrucciones}` : ""}${mensajeCancelacionRecordatorio ? `\n\n${mensajeCancelacionRecordatorio}` : horasLimite != null ? `\n\n⚠️ Puedes cancelar con al menos ${horasLimite} hora${horasLimite !== 1 ? "s" : ""} de anticipación.${telefonoEmpresa ? ` Ante cualquier eventualidad, comunícate al ${telefonoEmpresa}.` : ""}` : ""}${es24h && confirmarUrl && !mensajeCancelacionRecordatorio ? `\n\nConfirmar asistencia: ${confirmarUrl}\nCancelar: ${cancelarUrl}` : ""}`,
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
  const { nombreCliente, fechaInicio, fechaFin, tipoPlan } = data;

  const nombresPlan = {
    creditos: "La Santa Navaja",
    combo_visita_corte_barba: "La Santa Dupla",
    padre_e_hijo: "En el nombre del padre y del hijo",
    barba: "La Santa Barba",
  };

  const nombrePlan = nombresPlan[tipoPlan] ?? "Plan suscripción";

  return await sendBaseEmail({
    to,
    subject: "¡Tu suscripción está activa! – Agenda Fonfach",
    html: layout(`
  <h2 style="margin-top:0;">¡Bienvenido/a, ${nombreCliente}! 🎉</h2>
  <p style="color:#555;">Tu suscripción <strong>${nombrePlan}</strong> ya está activa y lista para usar.</p>

  <table cellpadding="8" cellspacing="0" border="0" width="100%"
        style="background:#f9f9f9;border-radius:6px;margin:16px 0;">
    <tr><td style="font-size:14px;color:#555;width:50%;">Plan</td><td style="font-weight:bold;">${nombrePlan}</td></tr>
    <tr><td style="font-size:14px;color:#555;">Activación</td><td style="font-weight:bold;">${fechaInicio}</td></tr>
    <tr><td style="font-size:14px;color:#555;">Válida hasta</td><td style="font-weight:bold;">${fechaFin}</td></tr>
  </table>

  <div style="background:#f0f7ff;border-left:4px solid #1a73e8;padding:16px;border-radius:4px;margin:16px 0;">
    <p style="margin:0;color:#555;font-size:14px;line-height:1.6;">
      ℹ️ <strong>Importante:</strong> Para que tu suscripción quede completamente habilitada,
      cierra sesión e inicia sesión nuevamente en la aplicación.
      <br/><br/>
      📅 Desde este momento podrás visualizar hasta <strong>31 días de disponibilidad</strong>
      en el calendario al momento de reservar tus horas.
    </p>
  </div>

  <p style="color:#555;font-size:14px;">
    Tu suscripción tiene una duración de <strong>1 mes</strong> o hasta que hagas uso de todos tus servicios incluidos, lo que ocurra primero.
  </p>

  <p style="color:#555;font-size:14px;">
    Puedes reservar tu hora cuando quieras desde la app. ¡Nos vemos pronto! ✂️
  </p>

  <p style="color:#555;font-size:14px;">
    Atentamente,<br/><strong>Equipo 🗓️ Agenda Fonfach</strong>
  </p>
`),
    text: `¡Tu suscripción está activa!

Hola ${nombreCliente}, tu plan ${nombrePlan} ya está listo.

Activación: ${fechaInicio}
Válida hasta: ${fechaFin}

IMPORTANTE:
- Cierra sesión e inicia sesión nuevamente para activar todos los beneficios de tu suscripción.
- Ahora podrás visualizar hasta 31 días de disponibilidad en el calendario al reservar.

Recuerda que tu suscripción dura 1 mes o hasta agotar tus servicios.

Equipo 🗓️ Agenda Fonfach`,
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
  const { titulo, cuerpo, nombreEmpresa, slotSugerido, linkAgendamiento } =
    data;

  const bloqueSlot =
    slotSugerido && linkAgendamiento
      ? `
    <div style="background:#f8f9ff;border:1.5px solid #e8eaff;border-radius:12px;padding:20px;margin:24px 0;text-align:center;">
      <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#888;font-weight:600;">
        Tu próxima hora disponible
      </p>
      <p style="margin:8px 0;font-size:20px;font-weight:700;color:#111;">
        ${slotSugerido.fecha}
      </p>
      <p style="margin:0 0 16px;font-size:24px;font-weight:800;color:#4361ee;">
        🕐 ${slotSugerido.hora}
      </p>
      <a href="${linkAgendamiento}"
         style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:10px;">
        ✅ Confirmar esta hora
      </a>
      <p style="margin:12px 0 0;font-size:12px;color:#aaa;">
        Este enlace expira en 48 horas
      </p>
    </div>
  `
      : "";

  return await sendBaseEmail({
    to,
    subject: `${titulo} – ${nombreEmpresa || "La Santa Barbería"}`,
    html: layout(`
      <h2 style="margin-top:0;">${titulo}</h2>
      <p style="color:#555;font-size:15px;line-height:1.7;">${cuerpo}</p>
      ${bloqueSlot}
      <p style="color:#aaa;font-size:12px;margin-top:32px;">
        Este recordatorio fue enviado por <strong>${nombreEmpresa || "La Santa Barbería"}</strong>.
      </p>
    `),
    text: slotSugerido
      ? `${titulo}\n\n${cuerpo.replace(/<[^>]*>/g, "")}\n\nTu próxima hora: ${slotSugerido.fecha} a las ${slotSugerido.hora}\nConfirmar: ${linkAgendamiento}`
      : `${titulo}\n\n${cuerpo.replace(/<[^>]*>/g, "")}`,
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

export const sendReagendamientoEmail = async (to, data) => {
  const {
    nombreCliente,
    nombreBarbero,
    servicio,
    fechaAnterior,
    nuevaFecha,
    nuevaHora,
    direccion,
  } = data;

  return await sendBaseEmail({
    to,
    subject: "Tu reserva fue reagendada – Agenda Fonfach",
    html: layout(`
      <h2 style="margin-top:0;">Reserva Reagendada 🔄</h2>

      <p>Hola <strong>${nombreCliente}</strong>, tu reserva ha sido reagendada correctamente.</p>

      <div style="background:#fff4f4;border-left:4px solid #e53935;padding:16px;border-radius:4px;margin:16px 0;">
        <p style="margin:0;font-size:14px;color:#555;">
          ⛔ <strong>Fecha anterior:</strong> ${fechaAnterior}
        </p>
      </div>

      ${detalles({
        nombreBarbero,
        servicio,
        fecha: nuevaFecha,
        hora: nuevaHora,
        direccion,
      })}

      <p style="color:#555;font-size:14px;">
        Si no puedes asistir, recuerda cancelar o reagendar con anticipación.
      </p>
    `),
    text: `Reserva reagendada\n\nHola ${nombreCliente}\n\nFecha anterior: ${fechaAnterior}\n\nNueva reserva:\nProfesional: ${nombreBarbero}\nServicio: ${servicio}\nFecha: ${nuevaFecha}\nHora: ${nuevaHora}\nDirección: ${direccion ?? "No especificada"}`,
  });
};

export const sendEmail = async ({ to, subject, html }) => {
  return await sendBaseEmail({ to, subject, html });
};

// mail/recordatorioPago.mail.js

export const sendRecordatorioPagoEmail = async (empresa, { tipo }) => {
  const destinatario = empresa.correo;
  if (!destinatario) return;

  const asuntos = {
    "5_dias_antes": "📅 Tu plan vence en 5 días – Agenda Fonfach",
    "2_dias_antes": "⚠️ Tu plan vence en 2 días – Agenda Fonfach",
    "1_dia_antes": "🚨 Tu plan vence mañana – Agenda Fonfach",
    vencimiento_hoy: "🔔 Tu plan vence hoy – Agenda Fonfach",
    suspension: "🔒 Tu acceso ha sido suspendido – Agenda Fonfach",
  };

  const mensajes = {
    "5_dias_antes": `
      <h2 style="margin-top:0;">📅 Tu plan vence en 5 días</h2>
      <p>Hola <strong>${empresa.nombre}</strong> 👋</p>
      <p>Te avisamos que tu plan vence en <strong>5 días</strong>.</p>
      <p style="color:#555;font-size:14px;">Para continuar sin interrupciones, realiza tu transferencia cuando puedas.</p>
      <p style="color:#aaa;font-size:13px;">Si ya realizaste el pago, ignora este mensaje.</p>
    `,
    "2_dias_antes": `
      <h2 style="margin-top:0;">⚠️ Tu plan vence en 2 días</h2>
      <p>Hola <strong>${empresa.nombre}</strong> 👋</p>
      <p>Tu plan vence en <strong>2 días</strong>.</p>
      <p style="color:#555;font-size:14px;">Para no perder el acceso, realiza tu pago a la brevedad.</p>
      <p style="color:#aaa;font-size:13px;">Si ya realizaste el pago, ignora este mensaje.</p>
    `,
    "1_dia_antes": `
    <h2 style="margin-top:0;">🚨 Tu plan vence mañana</h2>
    <p>Hola <strong>${empresa.nombre}</strong> 👋</p>
    <p>Te recordamos que tu plan vence <strong>mañana</strong>.</p>
    <p style="color:#555;font-size:14px;">Para no perder el acceso, realiza tu transferencia hoy.</p>
    <p style="color:#aaa;font-size:13px;">Si ya realizaste el pago, ignora este mensaje.</p>
  `,
    vencimiento_hoy: `
      <h2 style="margin-top:0;">🔔 Tu plan vence hoy</h2>
      <p>Hola <strong>${empresa.nombre}</strong> 👋</p>
      <p>Tu plan <strong>vence hoy</strong>.</p>
      <p style="color:#555;font-size:14px;">Realiza tu transferencia para mantener tu acceso activo.</p>
      <p style="color:#aaa;font-size:13px;">Si ya realizaste el pago, ignora este mensaje y nos comunicaremos pronto.</p>
    `,
    suspension: `
      <h2 style="margin-top:0;">🔒 Tu acceso ha sido suspendido</h2>
      <p>Hola <strong>${empresa.nombre}</strong> 👋</p>
      <p>Tu acceso ha sido <strong>suspendido temporalmente</strong> por falta de pago.</p>
      <div style="background:#fff8f0;border-left:4px solid #f0a500;padding:16px;border-radius:4px;margin:16px 0;">
        <p style="margin:0;color:#555;font-size:14px;">
          No te preocupes, <strong>no pierdes ningún dato</strong>. En cuanto confirmemos tu pago, tu cuenta se reactiva de inmediato.
        </p>
      </div>
      <p style="color:#555;font-size:14px;">¿Tienes dudas? Escríbenos y te ayudamos de inmediato.</p>
    `,
  };

  return await sendBaseEmail({
    to: destinatario,
    subject: asuntos[tipo],
    html: layout(mensajes[tipo]),
    text: mensajes[tipo].replace(/<[^>]*>/g, "").trim(),
  });
};

export const sendPostServiceCareEmail = async (to, data) => {
  const {
    nombreCliente,
    nombreBarbero,
    servicio,
    fecha,
    hora,
    cuidados,
    direccion,
    telefonoEmpresa,
  } = data;

  return await sendBaseEmail({
    to,
    subject: `Cuidados posteriores – ${servicio}`,
    html: layout(`
      <h2 style="margin-top:0;">Gracias por tu visita </h2>

      <p>
        Hola <strong>${nombreCliente}</strong>, esperamos que hayas disfrutado de tu experiencia.
      </p>

      <p>
        Para ayudarte a obtener los mejores resultados de tu servicio,
        te recomendamos seguir las indicaciones que encontrarás a continuación.
      </p>

      ${detalles({
        nombreBarbero,
        servicio,
        fecha,
        hora,
        direccion,
      })}

      ${bloqueCuidados(cuidados)}

      <div style="margin-top:20px;padding:12px;background:#fafafa;border-radius:6px;">
        <p style="margin:0;color:#666;font-size:14px;">
          💬 Si tienes dudas o presentas alguna molestia relacionada con tu servicio,
          puedes comunicarte con nosotros.
          ${
            telefonoEmpresa
              ? `<br><strong>Teléfono:</strong> ${telefonoEmpresa}`
              : ""
          }
        </p>
      </div>

      <p style="margin-top:20px;color:#777;font-size:14px;">
        Gracias por confiar en nosotros. Esperamos verte nuevamente pronto ✨
      </p>
    `),

    text: `
Gracias por tu visita

Hola ${nombreCliente},

Esperamos que hayas disfrutado de tu experiencia.

Servicio: ${servicio}
Profesional: ${nombreBarbero}
Fecha: ${fecha}
Hora: ${hora}

${cuidados ? `Cuidados posteriores:\n${cuidados}\n` : ""}

${
  telefonoEmpresa
    ? `Si tienes dudas puedes contactarnos al: ${telefonoEmpresa}`
    : ""
}

Gracias por confiar en nosotros.
    `,
  });
};

export const sendResetPasswordEmail = async (to, data) => {
  const { nombreUsuario, resetUrl } = data;

  return await sendBaseEmail({
    to,
    subject: "Restablecer contraseña – Agenda Fonfach",
    html: layout(`
      <h2 style="margin-top:0;">Restablecer contraseña 🔐</h2>

      <p>
        Hola <strong>${nombreUsuario}</strong>,
      </p>

      <p>
        Recibimos una solicitud para restablecer la contraseña de tu cuenta.
      </p>

      ${ctaButton(resetUrl, "Restablecer contraseña", "#4361ee")}

      <div style="background:#fff8f0;border-left:4px solid #f0a500;padding:16px;border-radius:4px;margin:16px 0;">
        <p style="margin:0;color:#555;font-size:14px;">
          ⏰ Este enlace expirará en <strong>15 minutos</strong>.
        </p>
      </div>

      <p style="color:#555;font-size:14px;">
        Si no solicitaste este cambio, puedes ignorar este correo.
      </p>
    `),

    text: `
Hola ${nombreUsuario}

Recibimos una solicitud para restablecer tu contraseña.

Utiliza el siguiente enlace:

${resetUrl}

Este enlace expira en 15 minutos.

Si no solicitaste este cambio, ignora este correo.
    `,
  });
};

export const sendRecomendacionSuscripcionEmail = async (to, data) => {
  const {
    nombreCliente,
    nombreEmpresa,
    suscripcionSugerida,
    nombrePlan,
    motivo,
    ahorroMensual,
    ahorroAnual,
    equivalenteCortes,
    precioPlan,
  } = data;

  const planes = {
    creditos: "Créditos de Corte",
    combo_visita_corte_barba: "Corte + Barba",
    barba: "Barba Semanal",
  };

  const iconosPlan = {
    creditos: "✂️",
    combo_visita_corte_barba: "💈",
    barba: "🪒",
  };

  const nombrePlanFinal =
    nombrePlan || planes[suscripcionSugerida] || "Plan personalizado";
  const iconoPlan = iconosPlan[suscripcionSugerida] || "💈";
  const whatsapp = "+56996817505";
  const mensajeWhatsApp = encodeURIComponent(
    `Hola, quiero activar la suscripción recomendada (${nombrePlanFinal})`,
  );
  const linkWhatsApp = `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${mensajeWhatsApp}`;

  const formatCLP = (n) => `$${Number(n || 0).toLocaleString("es-CL")}`;

  return await sendBaseEmail({
    to,
    subject: `${iconoPlan} ${nombreEmpresa} tiene un plan pensado para ti`,
    html: layout(`
      <!-- Header -->
      <div style="text-align:center;padding:32px 0 24px;">
        <div style="font-size:48px;line-height:1;margin-bottom:12px;">${iconoPlan}</div>
        <h1 style="margin:0;font-size:22px;font-weight:700;color:#111;letter-spacing:-0.3px;">
          Un plan pensado para ti
        </h1>
        <p style="margin:8px 0 0;color:#666;font-size:15px;">
          Basado en tu historial de visitas en <strong>La Santa Barbería</strong>
        </p>
      </div>

      <!-- Saludo -->
      <p style="font-size:16px;color:#333;margin:0 0 20px;">
        Hola <strong>${nombreCliente}</strong> 👋
      </p>

      <!-- Motivo -->
      <div style="background:#f8f9ff;border-left:3px solid #4361ee;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:28px;">
        <p style="margin:0;color:#444;font-size:14px;line-height:1.7;">
          ${motivo}
        </p>
      </div>

      <!-- Plan recomendado -->
      <div style="background:#fff;border:1.5px solid #e8eaff;border-radius:12px;overflow:hidden;margin-bottom:24px;">
        <!-- Header plan -->
        <div style="background:#4361ee;padding:16px 20px;">
          <p style="margin:0;color:rgba(255,255,255,0.75);font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">
            Plan recomendado
          </p>
          <p style="margin:4px 0 0;color:#fff;font-size:20px;font-weight:700;">
            ${nombrePlanFinal}
          </p>
        </div>

        <!-- Precio -->
        ${
          precioPlan
            ? `
        <div style="padding:16px 20px;border-bottom:1px solid #f0f0f0;">
          <span style="font-size:28px;font-weight:700;color:#111;">${formatCLP(precioPlan)}</span>
          <span style="font-size:14px;color:#888;margin-left:4px;">/ mes</span>
        </div>
        `
            : ""
        }

        <!-- Beneficios -->
        <div style="padding:20px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #f5f5f5;">
                <span style="font-size:18px;">💰</span>
                <span style="font-size:14px;color:#555;margin-left:8px;">Ahorro mensual</span>
              </td>
              <td style="text-align:right;font-weight:700;color:#111;font-size:15px;border-bottom:1px solid #f5f5f5;">
                ${formatCLP(ahorroMensual)}
              </td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #f5f5f5;">
                <span style="font-size:18px;">📅</span>
                <span style="font-size:14px;color:#555;margin-left:8px;">Ahorro al año</span>
              </td>
              <td style="text-align:right;font-weight:700;color:#22c55e;font-size:15px;border-bottom:1px solid #f5f5f5;">
                ${formatCLP(ahorroAnual)}
              </td>
            </tr>
            <tr>
              <td style="padding:10px 0;">
                <span style="font-size:18px;">✂️</span>
                <span style="font-size:14px;color:#555;margin-left:8px;">Equivale a cortes gratis</span>
              </td>
              <td style="text-align:right;font-weight:700;color:#111;font-size:15px;">
                ${equivalenteCortes} cortes
              </td>
            </tr>
          </table>
        </div>
      </div>

      <!-- Cómo activarlo -->
      <div style="background:#f9fafb;border-radius:10px;padding:20px;margin-bottom:28px;">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#111;">¿Cómo activarlo?</p>
        <p style="margin:0;font-size:14px;color:#555;line-height:1.7;">
          Escríbele a tu barbero por WhatsApp. Él te explicará cómo funciona y cómo realizar el pago del plan.
        </p>
      </div>

      <!-- CTA WhatsApp -->
      <div style="text-align:center;margin-bottom:32px;">
        <a href="${linkWhatsApp}"
           style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:10px;">
          💬 Escribir al barbero por WhatsApp
        </a>
        <p style="margin:12px 0 0;color:#999;font-size:13px;">${whatsapp}</p>
      </div>

      <!-- Footer -->
      <div style="border-top:1px solid #f0f0f0;padding-top:20px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#bbb;line-height:1.6;">
          Este correo fue generado automáticamente según tu historial de visitas en ${nombreEmpresa}.<br/>
          Si no deseas recibir más recomendaciones, responde este correo y lo gestionamos.
        </p>
      </div>
    `),
    text: `
Hola ${nombreCliente},

${nombreEmpresa} tiene un plan pensado para ti: ${nombrePlanFinal}.

${motivo}

${precioPlan ? `Precio: ${formatCLP(precioPlan)} / mes\n` : ""}
Ahorro mensual: ${formatCLP(ahorroMensual)}
Ahorro anual: ${formatCLP(ahorroAnual)}
Equivale a: ${equivalenteCortes} cortes gratis

Para activarlo, habla con tu barbero por WhatsApp:
${whatsapp}
${linkWhatsApp}

Este correo fue generado automáticamente según tu historial de visitas.
    `.trim(),
  });
};
