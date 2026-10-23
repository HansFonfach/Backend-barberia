// Correos del módulo de reservas de mesa. Ninguno se envía si la reserva no
// tiene correo, y un fallo de envío nunca deshace la reserva: se registra en
// consola y la operación sigue.
import { sendBaseEmail } from "../../controllers/mailController.js";

const BASE_URL = "https://www.agendafonfach.cl";

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** "2026-10-23" → "viernes 23 de octubre" */
export const fechaLarga = (fecha) => {
  const [y, m, d] = fecha.split("-").map(Number);
  const dia = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return `${DIAS[dia]} ${d} de ${MESES[m - 1]}`;
};

const layout = (empresa, cuerpo) => `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f5f5"><tr><td align="center" style="padding:32px 16px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border-radius:8px;max-width:600px;width:100%;">
<tr><td style="background:#1a1a1a;padding:20px 32px;border-radius:8px 8px 0 0;">
<p style="margin:0;color:#fff;font-size:20px;font-weight:bold;">${esc(empresa.nombre)}</p></td></tr>
<tr><td style="padding:32px;color:#333;font-size:15px;line-height:1.6;">${cuerpo}</td></tr>
<tr><td style="background:#f0f0f0;padding:16px 32px;text-align:center;border-radius:0 0 8px 8px;">
<p style="margin:0;font-size:12px;color:#888;">Reservas con Agenda Fonfach · agendafonfach.cl</p></td></tr>
</table></td></tr></table></body></html>`;

const tablaReserva = (r, empresa) => `
<table cellpadding="8" cellspacing="0" border="0" width="100%" style="background:#f9f9f9;border-radius:6px;margin:16px 0;font-size:14px;">
<tr><td style="color:#555;width:40%;">Código</td><td style="font-weight:bold;letter-spacing:1px;">${esc(r.codigo)}</td></tr>
<tr><td style="color:#555;">Fecha</td><td style="font-weight:bold;">${esc(fechaLarga(r.fecha))}</td></tr>
<tr><td style="color:#555;">Hora de llegada</td><td style="font-weight:bold;">${esc(r.hora)}</td></tr>
<tr><td style="color:#555;">Personas</td><td style="font-weight:bold;">${r.personas}</td></tr>
<tr><td style="color:#555;">Sector</td><td style="font-weight:bold;">${esc(r.sector.nombre)}</td></tr>
${r.cumpleanos?.es ? `<tr><td style="color:#555;">Cumpleaños</td><td style="font-weight:bold;">🎂 ${esc(r.cumpleanos.festejado || "Sí")}</td></tr>` : ""}
${empresa.direccion ? `<tr><td style="color:#555;">Dirección</td><td style="font-weight:bold;">${esc(empresa.direccion)}</td></tr>` : ""}
</table>`;

const contacto = (empresa) =>
  empresa.telefono
    ? `<p style="font-size:14px;color:#555;">¿Algún cambio? Llámanos al <a href="tel:${esc(empresa.telefono)}" style="color:#1a73e8;">${esc(empresa.telefono)}</a>.</p>`
    : "";

const linkCancelar = (empresa, token) =>
  token
    ? `<p style="font-size:14px;color:#555;">Si no puedes venir, <a href="${BASE_URL}/${esc(empresa.slug)}/cancelar-reserva-mesa?token=${esc(token)}" style="color:#1a73e8;">cancela tu reserva aquí</a> para liberar el lugar.</p>`
    : "";

const enviar = async (to, subject, html) => {
  if (!to) return;
  try {
    const r = await sendBaseEmail({ to, subject, html });
    if (r?.error) console.error("❌ Resend rechazó correo de reserva de mesa:", r.error);
  } catch (e) {
    console.error("❌ Error enviando correo de reserva de mesa:", e.message);
  }
};

/** Al crear (web o panel con correo) y al confirmar una pendiente. */
export const correoReservaCliente = (reserva, empresa, { token = null, config } = {}) => {
  const confirmada = reserva.estado === "confirmada";
  const titulo = confirmada ? "¡Tu reserva está confirmada!" : "Recibimos tu solicitud de reserva";
  const intro = confirmada
    ? `Hola ${esc(reserva.cliente.nombre)}, te esperamos.`
    : `Hola ${esc(reserva.cliente.nombre)}, recibimos tu solicitud. Te avisaremos por correo cuando el local la confirme.`;
  const tolerancia =
    confirmada && config?.toleranciaMinutos
      ? `<p style="font-size:14px;color:#555;">Guardamos tu lugar hasta ${config.toleranciaMinutos} minutos después de la hora de llegada.</p>`
      : "";
  const permiteCancelar = config?.cancelacionWeb?.permitida;
  return enviar(
    reserva.cliente.email,
    confirmada ? `✅ Reserva confirmada en ${empresa.nombre}` : `📩 Solicitud de reserva en ${empresa.nombre}`,
    layout(
      empresa,
      `<h2 style="margin:0 0 8px;">${titulo}</h2><p>${intro}</p>${tablaReserva(reserva, empresa)}${tolerancia}${permiteCancelar ? linkCancelar(empresa, token) : ""}${contacto(empresa)}`,
    ),
  );
};

export const correoReservaCancelada = (reserva, empresa) =>
  enviar(
    reserva.cliente.email,
    `Reserva cancelada en ${empresa.nombre}`,
    layout(
      empresa,
      `<h2 style="margin:0 0 8px;">Tu reserva fue cancelada</h2>
       <p>Hola ${esc(reserva.cliente.nombre)}, la reserva de abajo quedó cancelada${reserva.cancelacion?.por === "cliente" ? " a tu pedido" : ""}.</p>
       ${tablaReserva(reserva, empresa)}
       <p><a href="${BASE_URL}/${esc(empresa.slug)}/reservar-mesa" style="color:#1a73e8;">Hacer una nueva reserva</a></p>${contacto(empresa)}`,
    ),
  );

export const correoRecordatorio = (reserva, empresa, { token = null, config } = {}) =>
  enviar(
    reserva.cliente.email,
    `⏰ Recordatorio: tu reserva en ${empresa.nombre}`,
    layout(
      empresa,
      `<h2 style="margin:0 0 8px;">Te esperamos pronto</h2>
       <p>Hola ${esc(reserva.cliente.nombre)}, te recordamos tu reserva:</p>
       ${tablaReserva(reserva, empresa)}
       ${config?.cancelacionWeb?.permitida ? linkCancelar(empresa, token) : ""}${contacto(empresa)}`,
    ),
  );

/** Aviso al local de una reserva nueva hecha desde la web. */
export const correoAvisoLocal = (reserva, empresa) =>
  enviar(
    empresa.correo,
    `${reserva.estado === "pendiente" ? "🕒 Reserva por confirmar" : "🆕 Nueva reserva"}: ${reserva.cliente.nombre}, ${reserva.personas} pers., ${reserva.fecha} ${reserva.hora}`,
    layout(
      empresa,
      `<h2 style="margin:0 0 8px;">Nueva reserva desde la web</h2>
       ${reserva.estado === "pendiente" ? "<p><strong>Queda pendiente: confírmala o recházala en el panel.</strong></p>" : ""}
       ${tablaReserva(reserva, empresa)}
       <p style="font-size:14px;">Teléfono: <a href="tel:${esc(reserva.cliente.telefono)}">${esc(reserva.cliente.telefono)}</a></p>
       ${reserva.comentarios ? `<p style="font-size:14px;">Comentarios: ${esc(reserva.comentarios)}</p>` : ""}
       <p><a href="${BASE_URL}/${esc(empresa.slug)}/admin/reservas-mesa-hoy" style="color:#1a73e8;">Abrir el panel</a></p>`,
    ),
  );
