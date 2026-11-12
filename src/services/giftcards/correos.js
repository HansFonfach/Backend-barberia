// Correos de giftcards (Resend, mismo remitente que el resto del sistema).
// Todo lo que escribe el cliente (nombres, mensaje) se escapa: va dentro de HTML.
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { sendBaseEmail } from "../../controllers/mailController.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const SITIO = "https://www.agendafonfach.cl";
const COLOR_DEFECTO = "#1a1a2e";

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const clp = (n) => `$${Math.round(Number(n) || 0).toLocaleString("es-CL")}`;
const fecha = (d) => dayjs(d).tz("America/Santiago").format("DD-MM-YYYY");

const colorDe = (empresa) => {
  const c = empresa?.colores?.primario;
  return /^#[0-9a-f]{6}$/i.test(c || "") && c.toLowerCase() !== "#5e72e4" ? c : COLOR_DEFECTO;
};

export const linkGiftcard = (empresa, codigo) => `${SITIO}/${empresa.slug}/giftcard/${codigo}`;
export const linkReservarConGiftcard = (empresa, codigo) => `${SITIO}/${empresa.slug}/reservar?giftcard=${codigo}`;

const valorTexto = (gc) => (gc.tipo === "servicio" ? esc(gc.servicioNombre) : clp(gc.monto));

const boton = (href, texto, color) => `
  <a href="${href}" style="display:inline-block;padding:12px 22px;background:${color};color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;">${texto}</a>`;

const marco = (empresa, cuerpo) => {
  const color = colorDe(empresa);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f4f4f6;font-family:Arial,Helvetica,sans-serif;color:#222;">
    <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f4f4f6"><tr><td align="center" style="padding:28px 12px;">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:${color};padding:18px 28px;color:#fff;font-size:18px;font-weight:bold;">${esc(empresa.nombre)}</td></tr>
        <tr><td style="padding:26px 28px;font-size:15px;line-height:1.55;">${cuerpo}</td></tr>
        <tr><td style="padding:14px 28px;background:#fafafa;color:#999;font-size:12px;">Enviado por Agenda Fonfach a nombre de ${esc(empresa.nombre)}.</td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
};

/** La tarjeta en el correo (tabla simple, se ve bien en Gmail/Outlook). */
const tarjetaHtml = (empresa, gc) => {
  const color = colorDe(empresa);
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${color};border-radius:14px;color:#fff;margin:18px 0;">
    <tr><td style="padding:22px 24px;">
      <div style="font-size:12px;letter-spacing:3px;opacity:.85;">GIFTCARD · ${esc(empresa.nombre).toUpperCase()}</div>
      <div style="font-size:24px;font-weight:bold;margin:10px 0 4px;">${valorTexto(gc)}</div>
      ${gc.destinatario?.nombre ? `<div style="font-size:15px;">Para: <strong>${esc(gc.destinatario.nombre)}</strong></div>` : ""}
      ${gc.de ? `<div style="font-size:15px;">De: <strong>${esc(gc.de)}</strong></div>` : ""}
      ${gc.mensaje ? `<div style="font-size:15px;font-style:italic;margin-top:10px;">“${esc(gc.mensaje)}”</div>` : ""}
      <div style="margin-top:16px;background:rgba(255,255,255,.18);border-radius:8px;padding:10px 12px;font-size:20px;font-weight:bold;letter-spacing:2px;text-align:center;">${esc(gc.codigo)}</div>
      ${gc.venceEn ? `<div style="font-size:12px;opacity:.85;margin-top:8px;text-align:center;">Válida hasta el ${fecha(gc.venceEn)}</div>` : ""}
    </td></tr>
  </table>`;
};

const comoUsar = (empresa, gc) => `
  <p style="margin:0 0 6px;"><strong>¿Cómo se usa?</strong></p>
  <ol style="margin:0 0 16px;padding-left:20px;color:#444;">
    <li>Reserva tu hora en la página de ${esc(empresa.nombre)}.</li>
    <li>Al confirmar, escribe el código <strong>${esc(gc.codigo)}</strong> en “Código promocional”.</li>
    <li>${gc.tipo === "servicio" ? "El servicio queda pagado." : "Se descuenta del saldo de la giftcard."}</li>
  </ol>`;

/** Giftcard aprobada: al que la compró y al regalado (si dejó correo). */
export const correoGiftcardActiva = async (empresa, gc) => {
  const color = colorDe(empresa);
  const envios = [];
  const pie = `
    <p style="text-align:center;margin:18px 0 8px;">${boton(linkReservarConGiftcard(empresa, gc.codigo), "Reservar mi hora", color)}</p>
    <p style="text-align:center;font-size:13px;margin:0;"><a href="${linkGiftcard(empresa, gc.codigo)}" style="color:${color};">Ver la giftcard en línea</a></p>`;

  if (gc.comprador?.email) {
    envios.push(
      sendBaseEmail({
        to: gc.comprador.email,
        subject: `🎁 Tu giftcard de ${empresa.nombre} está lista`,
        html: marco(
          empresa,
          `<p style="margin-top:0;">Hola ${esc(gc.comprador.nombre)},</p>
           <p>${esc(empresa.nombre)} confirmó tu pago y la giftcard ya está activa${gc.destinatario?.nombre ? ` para <strong>${esc(gc.destinatario.nombre)}</strong>` : ""}.</p>
           ${tarjetaHtml(empresa, gc)}
           <p>Puedes reenviarle este correo o compartirle el link de la giftcard por WhatsApp${gc.destinatario?.email ? " (también se la enviamos a su correo)" : ""}.</p>
           ${comoUsar(empresa, gc)}${pie}`,
        ),
        text: `Tu giftcard de ${empresa.nombre} está lista. Código: ${gc.codigo}. Ver: ${linkGiftcard(empresa, gc.codigo)}`,
      }),
    );
  }

  const destino = gc.destinatario?.email;
  if (destino && destino !== gc.comprador?.email) {
    envios.push(
      sendBaseEmail({
        to: destino,
        subject: `🎁 ${gc.de || gc.comprador?.nombre || "Alguien"} te regaló una giftcard de ${empresa.nombre}`,
        html: marco(
          empresa,
          `<p style="margin-top:0;">Hola ${esc(gc.destinatario.nombre)},</p>
           <p>¡Te hicieron un regalo! ${esc(gc.de || gc.comprador?.nombre || "Alguien")} te regaló una giftcard de <strong>${esc(empresa.nombre)}</strong>.</p>
           ${tarjetaHtml(empresa, gc)}${comoUsar(empresa, gc)}${pie}`,
        ),
        text: `Te regalaron una giftcard de ${empresa.nombre}. Código: ${gc.codigo}. Ver: ${linkGiftcard(empresa, gc.codigo)}`,
      }),
    );
  }
  return Promise.allSettled(envios);
};

/** Solicitud recibida: al comprador. */
export const correoSolicitudRecibida = (empresa, gc) =>
  gc.comprador?.email
    ? sendBaseEmail({
        to: gc.comprador.email,
        subject: `Recibimos tu solicitud de giftcard · ${empresa.nombre}`,
        html: marco(
          empresa,
          `<p style="margin-top:0;">Hola ${esc(gc.comprador.nombre)},</p>
           <p>Recibimos tu solicitud de giftcard por <strong>${valorTexto(gc)}</strong>${gc.destinatario?.nombre ? ` para ${esc(gc.destinatario.nombre)}` : ""}.</p>
           <p>Cuando ${esc(empresa.nombre)} revise tu comprobante de pago, te enviaremos la giftcard a este correo.</p>`,
        ),
        text: `Recibimos tu solicitud de giftcard en ${empresa.nombre}. Te avisaremos cuando revisen tu pago.`,
      })
    : null;

/** Aviso al negocio: hay una solicitud por revisar. */
export const correoNuevaSolicitudLocal = (empresa, gc) =>
  empresa.correo
    ? sendBaseEmail({
        to: empresa.correo,
        subject: `🎁 Nueva solicitud de giftcard (${gc.tipo === "servicio" ? gc.servicioNombre : clp(gc.monto)})`,
        html: marco(
          empresa,
          `<p style="margin-top:0;"><strong>${esc(gc.comprador?.nombre)}</strong> pidió una giftcard por <strong>${valorTexto(gc)}</strong> (${clp(gc.monto)}) y subió su comprobante de transferencia.</p>
           <p>Revisa que el pago te haya llegado y apruébala desde el panel: recién ahí se le envía.</p>
           <p style="text-align:center;margin:18px 0 6px;">${boton(`${SITIO}/${empresa.slug}/admin/giftcards`, "Revisar solicitud", colorDe(empresa))}</p>`,
        ),
        text: `Nueva solicitud de giftcard de ${gc.comprador?.nombre}. Revísala en ${SITIO}/${empresa.slug}/admin/giftcards`,
      })
    : null;

/** Solicitud rechazada: al comprador. */
export const correoSolicitudRechazada = (empresa, gc) =>
  gc.comprador?.email
    ? sendBaseEmail({
        to: gc.comprador.email,
        subject: `Tu solicitud de giftcard no fue aprobada · ${empresa.nombre}`,
        html: marco(
          empresa,
          `<p style="margin-top:0;">Hola ${esc(gc.comprador.nombre)},</p>
           <p>${esc(empresa.nombre)} no pudo aprobar tu solicitud de giftcard por ${valorTexto(gc)}.</p>
           ${gc.rechazo?.motivo ? `<p><strong>Motivo:</strong> ${esc(gc.rechazo.motivo)}</p>` : ""}
           <p>Si crees que es un error, comunícate directamente con el local.</p>`,
        ),
        text: `Tu solicitud de giftcard en ${empresa.nombre} no fue aprobada. ${gc.rechazo?.motivo || ""}`,
      })
    : null;
