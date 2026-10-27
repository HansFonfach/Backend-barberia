// WhatsApp de reservas de mesa (API de WhatsApp Cloud de Meta, la misma cuenta
// y variables de entorno que ya usa el sistema: ACCESS_TOKEN y PHONE_NUMBER).
//
// Meta solo deja iniciar conversaciones con PLANTILLAS aprobadas. Estas dos
// hay que crearlas en WhatsApp Manager con estos nombres exactos:
//
//  1) recordatorio_reserva_mesa  (Utilidad, Español)
//     Cuerpo ({{1}} nombre, {{2}} local, {{3}} "hoy a las 21:00", {{4}} personas,
//     {{5}} sector, {{6}} dirección, {{7}} teléfono de contacto del local):
//       Hola {{1}} 👋
//       Te esperamos en *{{2}}* {{3}}.
//       👥 {{4}} personas · 🪑 {{5}}
//       📍 {{6}}
//       ¿Nos confirmas tu asistencia? Toca uno de los botones de abajo.
//       📞 Si necesitas hablar con nosotros, escríbenos al {{7}}.
//       Si no puedes venir, avísanos para liberar la mesa 🙏
//     Botones "Visitar sitio web" con URL dinámica:
//       Confirmar asistencia → https://www.agendafonfach.cl/asistencia-mesa/confirmar?token={{1}}
//       No podré ir          → https://www.agendafonfach.cl/asistencia-mesa/cancelar?token={{1}}
//
//  2) nueva_reserva_mesa  (Utilidad, Español)
//     Cuerpo:
//       🍽️ *Nueva reserva en {{1}}*
//       👤 Cliente: {{2}}
//       👥 Personas: {{3}}
//       📅 Día y hora: {{4}}
//       🪑 Sector: {{5}}
//       📞 Teléfono: {{6}}
//       Estado: *{{7}}*
//       Revisa los detalles y confírmala desde tu panel de AgendaFonfach.
//     Botón "Visitar sitio web" con URL dinámica:
//       Ver en el panel → https://www.agendafonfach.cl/{{1}}   ({{1}} = "slug/admin/reservas-mesa-hoy?fecha=...")
import { diaSemana, hoyChile, sumarDias } from "./tiempo.js";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
/** "2026-10-30" → "viernes 30 de octubre" (sin depender del módulo de correos) */
const fechaLarga = (fecha) => {
  const [, m, d] = fecha.split("-").map(Number);
  return `${DIAS[diaSemana(fecha)]} ${d} de ${MESES[m - 1]}`;
};

export const PLANTILLA_CONFIRMACION = "recordatorio_reserva_mesa";
export const PLANTILLA_AVISO_LOCAL = "nueva_reserva_mesa";
// Idioma con que se crearon las plantillas en Meta (las otras del sistema usan es_CL)
const IDIOMA = process.env.WHATSAPP_IDIOMA_MESAS || "es_CL";

const URL_API = () => `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER}/messages`;

/** Mismo formato que usa whatsappService para los teléfonos chilenos. */
export const formatearTelefono = (telefono) => {
  const d = String(telefono || "").replace(/\D/g, "");
  if (d.startsWith("56")) return d;
  if (d.startsWith("9") && d.length === 9) return `56${d}`;
  if (d.length === 8) return `569${d}`;
  return d;
};

// Meta rechaza parámetros con saltos de línea, tabs o muchos espacios seguidos
const parametro = (v) =>
  ({ type: "text", text: String(v ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 300) || "-" });

const enviarPlantilla = async ({ telefono, plantilla, parametros, botonesUrl = [] }) => {
  if (!process.env.ACCESS_TOKEN || !process.env.PHONE_NUMBER) {
    return { ok: false, error: "Faltan ACCESS_TOKEN o PHONE_NUMBER" };
  }
  const to = formatearTelefono(telefono);
  if (to.length < 10) return { ok: false, error: "Teléfono inválido" };

  const components = [{ type: "body", parameters: parametros.map(parametro) }];
  botonesUrl.forEach((valor, index) => {
    components.push({ type: "button", sub_type: "url", index: String(index), parameters: [{ type: "text", text: valor }] });
  });

  try {
    const res = await fetch(URL_API(), {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: { name: plantilla, language: { code: IDIOMA }, components },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = data?.error?.message || `HTTP ${res.status}`;
      console.error(`❌ WhatsApp ${plantilla}:`, error);
      return { ok: false, error };
    }
    return { ok: true };
  } catch (e) {
    console.error(`❌ WhatsApp ${plantilla}:`, e.message);
    return { ok: false, error: e.message };
  }
};

/** "hoy a las 21:00", "mañana a las 21:00" o "el viernes 30 de octubre a las 21:00". */
export const cuandoEs = (reserva, ahora = new Date()) => {
  const hoy = hoyChile(ahora);
  if (reserva.fecha === hoy) return `hoy a las ${reserva.hora}`;
  if (reserva.fecha === sumarDias(hoy, 1)) return `mañana a las ${reserva.hora}`;
  return `el ${fechaLarga(reserva.fecha)} a las ${reserva.hora}`;
};

/**
 * Al cliente: "¿Nos confirmas tu asistencia?" con botones Confirmar / No podré ir.
 * `telefonoContacto`: número que se le muestra para hablar con el local.
 */
export const whatsappConfirmacionAsistencia = (reserva, empresa, token, ahora = new Date(), telefonoContacto = "") =>
  enviarPlantilla({
    telefono: reserva.cliente.telefono,
    plantilla: PLANTILLA_CONFIRMACION,
    parametros: [
      reserva.cliente.nombre.split(/\s+/)[0],
      empresa.nombre,
      cuandoEs(reserva, ahora),
      reserva.personas,
      reserva.sector.nombre,
      empresa.direccion || empresa.nombre,
      telefonoContacto || empresa.telefono || "el teléfono del local",
    ],
    botonesUrl: [token, token],
  });

/** Al local: aviso de una reserva nueva hecha desde la web. */
export const whatsappAvisoLocal = async (reserva, empresa, telefonos = []) => {
  const nombre = `${reserva.cliente.nombre}${reserva.cumpleanos?.es ? " (cumpleaños)" : ""}`;
  const estado = reserva.estado === "pendiente" ? "pendiente, confírmala en el panel" : "confirmada";
  const resultados = [];
  for (const telefono of telefonos) {
    resultados.push(
      await enviarPlantilla({
        telefono,
        plantilla: PLANTILLA_AVISO_LOCAL,
        botonesUrl: [`${empresa.slug}/admin/reservas-mesa-hoy?fecha=${reserva.fecha}`],
        parametros: [
          empresa.nombre,
          nombre,
          reserva.personas,
          `${fechaLarga(reserva.fecha)} a las ${reserva.hora}`,
          reserva.sector.nombre,
          reserva.cliente.telefono,
          estado,
        ],
      }),
    );
  }
  return resultados;
};
