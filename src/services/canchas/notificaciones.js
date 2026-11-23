// Correos y WhatsApp del módulo de canchas. Un fallo de envío nunca deshace
// la reserva: se registra en consola y la operación sigue.
//
// WhatsApp (API de WhatsApp Cloud de Meta, mismas variables ACCESS_TOKEN y
// PHONE_NUMBER del resto del sistema). Meta solo deja iniciar conversaciones
// con PLANTILLAS aprobadas; hay que crearlas en WhatsApp Manager con estos
// nombres exactos (Utilidad, Español). Mientras no estén aprobadas, el envío
// falla en silencio y los correos funcionan igual.
//
//  1) nueva_reserva_cancha  → al dueño/encargado
//       ⚽ *Nueva reserva en {{1}}*
//       👤 {{2}}
//       🏟️ {{3}}
//       📅 {{4}}
//       📞 {{5}}
//       Estado: *{{6}}*
//
//  2) recordatorio_reserva_cancha  → al cliente
//       Hola {{1}} 👋 Te esperamos en *{{2}}* {{3}} ({{4}}).
//       📍 {{5}}
//       Recuerda: {{6}}
//
//  3) cancha_liberada  → al cliente que se anotó en "avísame si se libera"
//       Hola {{1}} 👋 ¡Se liberó la cancha en *{{2}}*!
//       📅 {{3}}
//       🏟️ Disponible: {{4}}
//       Resérvala antes que otro: {{5}}
import { sendBaseEmail } from "../../controllers/mailController.js";
import { diaSemana, hoyChile, sumarDias } from "../reservasMesa/tiempo.js";

const BASE_URL = "https://www.agendafonfach.cl";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export const fechaLarga = (fecha) => {
  const [, m, d] = fecha.split("-").map(Number);
  return `${DIAS[diaSemana(fecha)]} ${d} de ${MESES[m - 1]}`;
};

export const tipoTexto = (r) => (r.tipo === "completa" ? "Cancha completa" : `Media cancha (mitad ${r.lados?.[0] || ""})`);

const clp = (n) => `$${Math.round(Number(n) || 0).toLocaleString("es-CL")}`;

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/* ─────────── Correos ─────────── */

const layout = (empresa, cuerpo) => `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#eef3ee;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef3ee"><tr><td align="center" style="padding:32px 16px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border-radius:10px;max-width:600px;width:100%;">
<tr><td style="background:#0f5132;padding:20px 32px;border-radius:10px 10px 0 0;border-bottom:4px solid #f5c518;">
<p style="margin:0;color:#fff;font-size:20px;font-weight:bold;">⚽ ${esc(empresa.nombre)}</p></td></tr>
<tr><td style="padding:32px;color:#333;font-size:15px;line-height:1.6;">${cuerpo}</td></tr>
<tr><td style="background:#f2f5f2;padding:16px 32px;text-align:center;border-radius:0 0 10px 10px;">
<p style="margin:0;font-size:12px;color:#888;">Reservas con Agenda Fonfach · agendafonfach.cl</p></td></tr>
</table></td></tr></table></body></html>`;

const tabla = (r, empresa) => `
<table cellpadding="8" cellspacing="0" border="0" width="100%" style="background:#f6faf6;border-radius:8px;margin:16px 0;font-size:14px;">
<tr><td style="color:#555;width:40%;">Código</td><td style="font-weight:bold;letter-spacing:1px;">${esc(r.codigo)}</td></tr>
<tr><td style="color:#555;">Día</td><td style="font-weight:bold;">${esc(fechaLarga(r.fecha))}</td></tr>
<tr><td style="color:#555;">Hora</td><td style="font-weight:bold;">${esc(r.hora)} a ${esc(String(Number(r.hora.slice(0, 2)) + 1).padStart(2, "0"))}:00</td></tr>
<tr><td style="color:#555;">Arriendo</td><td style="font-weight:bold;">${esc(tipoTexto(r))}</td></tr>
${r.equipo ? `<tr><td style="color:#555;">Equipo</td><td style="font-weight:bold;">${esc(r.equipo)}</td></tr>` : ""}
<tr><td style="color:#555;">Valor</td><td style="font-weight:bold;">${clp(r.precio)}</td></tr>
${empresa.direccion ? `<tr><td style="color:#555;">Dirección</td><td style="font-weight:bold;">${esc(empresa.direccion)}</td></tr>` : ""}
</table>`;

const reglasHtml = (config) =>
  config?.reglas?.length
    ? `<div style="background:#fff8e1;border-radius:8px;padding:12px 16px;font-size:14px;"><strong>Reglas del recinto</strong><ul style="margin:6px 0 0;padding-left:18px;">${config.reglas
        .map((x) => `<li>${esc(x)}</li>`)
        .join("")}</ul></div>`
    : "";

const abonoHtml = (r, config) =>
  r.abono?.requerido && r.pago?.estado === "pendiente"
    ? `<div style="background:#e8f4fd;border-radius:8px;padding:12px 16px;font-size:14px;margin-top:12px;">
       <strong>Para confirmar tu reserva transfiere el abono de ${clp(r.abono.monto)}.</strong>
       ${config?.abono?.instrucciones ? `<div style="white-space:pre-line;margin-top:6px;">${esc(config.abono.instrucciones)}</div>` : ""}
       </div>`
    : "";

const contacto = (empresa) =>
  empresa.telefono
    ? `<p style="font-size:14px;color:#555;">¿Algún cambio? Escríbenos al <a href="https://wa.me/${esc(String(empresa.telefono).replace(/\D/g, ""))}" style="color:#0f5132;">${esc(empresa.telefono)}</a>.</p>`
    : "";

const linkCancelar = (empresa, token, config) =>
  token && config?.cancelacion?.permitidaWeb
    ? `<p style="font-size:14px;color:#555;">Si no pueden jugar, <a href="${BASE_URL}/${esc(empresa.slug)}/cancelar-reserva-cancha?token=${esc(token)}" style="color:#0f5132;">cancela aquí</a> (hasta ${config.cancelacion.horasMinimo} horas antes) para liberar la cancha.</p>`
    : "";

const enviar = async (to, subject, html) => {
  if (!to) return;
  try {
    const r = await sendBaseEmail({ to, subject, html });
    if (r?.error) console.error("❌ Resend rechazó correo de cancha:", r.error);
  } catch (e) {
    console.error("❌ Error enviando correo de cancha:", e.message);
  }
};

export const correoReservaCliente = (r, empresa, { token = null, config } = {}) => {
  const confirmada = r.estado === "confirmada";
  return enviar(
    r.cliente.email,
    confirmada ? `✅ Cancha reservada en ${empresa.nombre}` : `📩 Recibimos tu reserva en ${empresa.nombre}`,
    layout(
      empresa,
      `<h2 style="margin:0 0 8px;color:#0f5132;">${confirmada ? "¡Cancha reservada! ⚽" : "Recibimos tu reserva"}</h2>
       <p>Hola ${esc(r.cliente.nombre)}, ${confirmada ? "los esperamos en la cancha." : "tu reserva queda pendiente hasta que el recinto la confirme."}</p>
       ${tabla(r, empresa)}${abonoHtml(r, config)}${reglasHtml(config)}${linkCancelar(empresa, token, config)}${contacto(empresa)}`,
    ),
  );
};

export const correoReservaConfirmada = (r, empresa, { config } = {}) =>
  enviar(
    r.cliente.email,
    `✅ Reserva confirmada en ${empresa.nombre}`,
    layout(
      empresa,
      `<h2 style="margin:0 0 8px;color:#0f5132;">¡Tu reserva está confirmada! ⚽</h2>
       <p>Hola ${esc(r.cliente.nombre)}, los esperamos.</p>${tabla(r, empresa)}${reglasHtml(config)}${contacto(empresa)}`,
    ),
  );

export const correoReservaCancelada = (r, empresa) =>
  enviar(
    r.cliente.email,
    `Reserva cancelada en ${empresa.nombre}`,
    layout(
      empresa,
      `<h2 style="margin:0 0 8px;">Tu reserva fue cancelada</h2>
       <p>Hola ${esc(r.cliente.nombre)}, la reserva de abajo quedó cancelada${r.cancelacion?.por === "cliente" ? " a tu pedido" : ""}.</p>
       ${r.cancelacion?.motivo && r.cancelacion?.por === "local" ? `<p style="background:#f6f6f6;border-radius:8px;padding:10px 14px;">${esc(r.cancelacion.motivo)}</p>` : ""}
       ${tabla(r, empresa)}
       <p><a href="${BASE_URL}/${esc(empresa.slug)}/reservar-cancha" style="color:#0f5132;">Reservar otra hora</a></p>${contacto(empresa)}`,
    ),
  );

export const correoRecordatorio = (r, empresa, { config } = {}) =>
  enviar(
    r.cliente.email,
    `⏰ Hoy juegan en ${empresa.nombre} a las ${r.hora}`,
    layout(
      empresa,
      `<h2 style="margin:0 0 8px;color:#0f5132;">¡Se viene el partido! ⚽</h2>
       <p>Hola ${esc(r.cliente.nombre)}, te recordamos tu reserva:</p>${tabla(r, empresa)}${reglasHtml(config)}${contacto(empresa)}`,
    ),
  );

export const correoAvisoLocal = (r, empresa) =>
  enviar(
    empresa.correo,
    `${r.estado === "pendiente" ? "🕒 Reserva por confirmar" : "⚽ Nueva reserva"}: ${r.cliente.nombre}, ${r.fecha} ${r.hora} (${r.tipo === "completa" ? "completa" : "media"})`,
    layout(
      empresa,
      `<h2 style="margin:0 0 8px;">Nueva reserva desde la web</h2>
       ${r.estado === "pendiente" ? "<p><strong>Queda pendiente: confírmala en el panel cuando llegue el abono.</strong></p>" : ""}
       ${tabla(r, empresa)}
       <p style="font-size:14px;">Teléfono: <a href="tel:${esc(r.cliente.telefono)}">${esc(r.cliente.telefono)}</a></p>
       ${r.comentarios ? `<p style="font-size:14px;">Comentarios: ${esc(r.comentarios)}</p>` : ""}
       <p><a href="${BASE_URL}/${esc(empresa.slug)}/admin/cancha-agenda?fecha=${esc(r.fecha)}" style="color:#0f5132;">Abrir la agenda</a></p>`,
    ),
  );

/* ─────────── WhatsApp ─────────── */

const IDIOMA = process.env.WHATSAPP_IDIOMA_CANCHAS || process.env.WHATSAPP_IDIOMA_MESAS || "es_CL";

export const formatearTelefono = (telefono) => {
  const d = String(telefono || "").replace(/\D/g, "");
  if (d.startsWith("56")) return d;
  if (d.startsWith("9") && d.length === 9) return `56${d}`;
  if (d.length === 8) return `569${d}`;
  return d;
};

const parametro = (v) => ({
  type: "text",
  text: String(v ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 300) || "-",
});

const enviarPlantilla = async (telefono, plantilla, parametros) => {
  if (!process.env.ACCESS_TOKEN || !process.env.PHONE_NUMBER) return { ok: false, error: "Sin credenciales de WhatsApp" };
  const to = formatearTelefono(telefono);
  if (to.length < 10) return { ok: false, error: "Teléfono inválido" };
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: { name: plantilla, language: { code: IDIOMA }, components: [{ type: "body", parameters: parametros.map(parametro) }] },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`❌ WhatsApp ${plantilla}:`, data?.error?.message || res.status);
      return { ok: false, error: data?.error?.message || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error(`❌ WhatsApp ${plantilla}:`, e.message);
    return { ok: false, error: e.message };
  }
};

export const cuandoEs = (r, ahora = new Date()) => {
  const hoy = hoyChile(ahora);
  if (r.fecha === hoy) return `hoy a las ${r.hora}`;
  if (r.fecha === sumarDias(hoy, 1)) return `mañana a las ${r.hora}`;
  return `el ${fechaLarga(r.fecha)} a las ${r.hora}`;
};

export const whatsappAvisoLocal = async (r, empresa, telefonos = []) => {
  for (const tel of telefonos) {
    await enviarPlantilla(tel, "nueva_reserva_cancha", [
      empresa.nombre,
      `${r.cliente.nombre}${r.equipo ? ` (${r.equipo})` : ""}`,
      tipoTexto(r),
      `${fechaLarga(r.fecha)} a las ${r.hora}`,
      r.cliente.telefono,
      r.estado === "pendiente" ? "pendiente de abono" : "confirmada",
    ]);
  }
};

export const whatsappRecordatorio = (r, empresa, config, ahora = new Date()) =>
  enviarPlantilla(r.cliente.telefono, "recordatorio_reserva_cancha", [
    r.cliente.nombre.split(/\s+/)[0],
    empresa.nombre,
    cuandoEs(r, ahora),
    tipoTexto(r),
    empresa.direccion || empresa.nombre,
    config?.reglas?.[0] || "llegar 10 minutos antes",
  ]);

/* ─────────── Lista de espera: "se liberó la cancha" ─────────── */

const disponibleTexto = (estado) =>
  estado.completa ? "cancha completa o media cancha" : `media cancha (mitad ${estado.libres.join("")})`;

export const linkReservarHora = (empresa, fecha, hora) =>
  `${BASE_URL}/${empresa.slug}/reservar-cancha?fecha=${fecha}&hora=${encodeURIComponent(hora)}`;

export const correoCanchaLiberada = (entrada, empresa, estado) =>
  enviar(
    entrada.cliente.email,
    `🔔 Se liberó la cancha: ${fechaLarga(entrada.fecha)} a las ${entrada.hora}`,
    layout(
      empresa,
      `<h2 style="margin:0 0 8px;color:#0f5132;">¡Se liberó la cancha! ⚽</h2>
       <p>Hola ${esc(entrada.cliente.nombre)}, te anotaste para que te avisáramos y la hora que querías quedó libre:</p>
       <table cellpadding="8" cellspacing="0" border="0" width="100%" style="background:#f6faf6;border-radius:8px;margin:16px 0;font-size:14px;">
       <tr><td style="color:#555;width:40%;">Día</td><td style="font-weight:bold;">${esc(fechaLarga(entrada.fecha))}</td></tr>
       <tr><td style="color:#555;">Hora</td><td style="font-weight:bold;">${esc(entrada.hora)}</td></tr>
       <tr><td style="color:#555;">Disponible</td><td style="font-weight:bold;">${esc(disponibleTexto(estado))}</td></tr>
       </table>
       <p style="text-align:center;margin:24px 0;"><a href="${linkReservarHora(empresa, entrada.fecha, entrada.hora)}" style="background:#0f5132;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;display:inline-block;">Reservar ahora</a></p>
       <p style="font-size:13px;color:#777;">Le avisamos a todos los que estaban esperando esta hora: la reserva es para el primero que la tome.</p>${contacto(empresa)}`,
    ),
  );

export const whatsappCanchaLiberada = (entrada, empresa, estado) =>
  enviarPlantilla(entrada.cliente.telefono, "cancha_liberada", [
    entrada.cliente.nombre.split(/\s+/)[0],
    empresa.nombre,
    `${fechaLarga(entrada.fecha)} a las ${entrada.hora}`,
    disponibleTexto(estado),
    linkReservarHora(empresa, entrada.fecha, entrada.hora),
  ]);
