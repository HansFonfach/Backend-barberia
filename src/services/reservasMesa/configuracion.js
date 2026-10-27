// Validación de la configuración que guarda el admin (pura, sin base).
import mongoose from "mongoose";
import { esHoraValida, minutosDeHora } from "./tiempo.js";
import { faltantesConfiguracion, CANAL_WEB } from "./reglas.js";
import { limpiarTexto } from "./utilidades.js";

const entero = (v, min, max) => {
  if (v === null || v === undefined || v === "") return { ok: true, valor: null };
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return { ok: false };
  return { ok: true, valor: n };
};

const NOMBRES_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Configuración vacía (nada precargado) para un local que aún no configura. */
export const configuracionVacia = () => ({
  sectores: [],
  horario: NOMBRES_DIA.map((_, dia) => ({ dia, abierto: false, desde: null, hasta: null })),
  intervaloMinutos: null,
  duracionMinutos: null,
  anticipacionMinimaMinutos: null,
  anticipacionMaximaDias: null,
  maxPersonasPorReserva: null,
  toleranciaMinutos: null,
  reservasWebActivas: false,
  maxPersonasWeb: null,
  confirmacionAutomaticaWeb: false,
  mostrarCuposWeb: false,
  mensajePublico: "",
  mensajeCumpleanos: "",
  cancelacionWeb: { permitida: false, horasLimite: null },
  recordatorio: { activo: false, horasAntes: null },
  listaEspera: { activa: false },
  contactoWeb: { whatsapp: "", mensajeSinLugar: "" },
  whatsapp: {
    avisoLocal: { activo: false, telefonos: [] },
    confirmacion: { activo: false, horasAntes: null },
  },
  permisosPersonal: { cancelar: false, forzarSobrecupo: false },
});

/**
 * @returns {{datos:object} | {error:string}}
 */
export const validarConfiguracion = (body = {}) => {
  const datos = {};

  // ── Sectores ──
  const sectores = Array.isArray(body.sectores) ? body.sectores : [];
  if (sectores.length > 20) return { error: "Máximo 20 sectores" };
  const nombres = new Set();
  datos.sectores = [];
  for (const [i, s] of sectores.entries()) {
    const nombre = limpiarTexto(s?.nombre, 40);
    if (!nombre) return { error: `El sector ${i + 1} no tiene nombre` };
    const clave = nombre.toLowerCase();
    if (nombres.has(clave)) return { error: `Hay dos sectores llamados "${nombre}"` };
    nombres.add(clave);
    const capacidad = entero(s?.capacidad, 1, 5000);
    if (!capacidad.ok || capacidad.valor === null) {
      return { error: `Indica la capacidad de "${nombre}" (personas que se pueden reservar a la vez)` };
    }
    const sector = {
      nombre,
      capacidad: capacidad.valor,
      activo: s?.activo !== false,
      reservableOnline: s?.reservableOnline !== false,
      orden: i,
    };
    if (s?._id) {
      if (!mongoose.isValidObjectId(s._id)) return { error: "Sector inválido" };
      sector._id = s._id;
    }
    datos.sectores.push(sector);
  }

  // ── Horario de llegadas ──
  const horario = Array.isArray(body.horario) ? body.horario : [];
  datos.horario = [];
  for (let dia = 0; dia < 7; dia++) {
    const d = horario.find((h) => Number(h?.dia) === dia) || {};
    const abierto = !!d.abierto;
    if (abierto) {
      if (!esHoraValida(d.desde) || !esHoraValida(d.hasta)) {
        return { error: `Revisa el horario del ${NOMBRES_DIA[dia]}` };
      }
      if (minutosDeHora(d.hasta) < minutosDeHora(d.desde)) {
        return {
          error: `El ${NOMBRES_DIA[dia]}: la última llegada no puede ser antes de la primera (llegadas después de medianoche aún no se soportan)`,
        };
      }
    }
    datos.horario.push({
      dia,
      abierto,
      desde: abierto ? d.desde : null,
      hasta: abierto ? d.hasta : null,
    });
  }

  // ── Números ──
  const numeros = [
    ["intervaloMinutos", 15, 60, "El intervalo de horas"],
    ["duracionMinutos", 15, 720, "La duración de la reserva"],
    ["anticipacionMinimaMinutos", 0, 10080, "La anticipación mínima"],
    ["anticipacionMaximaDias", 1, 365, "La anticipación máxima"],
    ["maxPersonasPorReserva", 1, 5000, "El máximo de personas por reserva"],
    ["toleranciaMinutos", 0, 240, "La tolerancia de atraso"],
    ["maxPersonasWeb", 1, 5000, "El máximo de personas por reserva web"],
  ];
  for (const [campo, min, max, etiqueta] of numeros) {
    const r = entero(body[campo], min, max);
    if (!r.ok) return { error: `${etiqueta} debe ser un número entero entre ${min} y ${max}` };
    datos[campo] = r.valor;
  }
  if (datos.intervaloMinutos !== null && ![15, 30, 60].includes(datos.intervaloMinutos)) {
    return { error: "El intervalo de horas debe ser 15, 30 o 60 minutos" };
  }
  if (datos.duracionMinutos !== null && datos.duracionMinutos % 15 !== 0) {
    return { error: "La duración debe ser múltiplo de 15 minutos" };
  }
  if (
    datos.maxPersonasWeb !== null &&
    datos.maxPersonasPorReserva !== null &&
    datos.maxPersonasWeb > datos.maxPersonasPorReserva
  ) {
    return { error: "El máximo web no puede ser mayor que el máximo por reserva" };
  }

  // ── Web, cancelación, recordatorio, permisos ──
  datos.reservasWebActivas = !!body.reservasWebActivas;
  datos.confirmacionAutomaticaWeb = !!body.confirmacionAutomaticaWeb;
  datos.mostrarCuposWeb = !!body.mostrarCuposWeb;
  datos.mensajePublico = limpiarTexto(body.mensajePublico, 600);
  datos.mensajeCumpleanos = limpiarTexto(body.mensajeCumpleanos, 600);

  const horasLimite = entero(body.cancelacionWeb?.horasLimite, 0, 720);
  if (!horasLimite.ok) return { error: "Las horas límite para cancelar deben ser un número entre 0 y 720" };
  datos.cancelacionWeb = { permitida: !!body.cancelacionWeb?.permitida, horasLimite: horasLimite.valor };
  if (datos.cancelacionWeb.permitida && datos.cancelacionWeb.horasLimite === null) {
    return { error: "Indica hasta cuántas horas antes se puede cancelar por el link" };
  }

  const horasAntes = entero(body.recordatorio?.horasAntes, 1, 72);
  if (!horasAntes.ok) return { error: "Las horas del recordatorio deben ser un número entre 1 y 72" };
  datos.recordatorio = { activo: !!body.recordatorio?.activo, horasAntes: horasAntes.valor };
  if (datos.recordatorio.activo && datos.recordatorio.horasAntes === null) {
    return { error: "Indica cuántas horas antes se envía el recordatorio" };
  }

  datos.listaEspera = { activa: !!body.listaEspera?.activa };

  const whatsappContacto = limpiarTexto(body.contactoWeb?.whatsapp, 25);
  const digitosContacto = whatsappContacto.replace(/\D/g, "");
  if (whatsappContacto && (digitosContacto.length < 8 || digitosContacto.length > 15)) {
    return { error: "Revisa el número de WhatsApp para consultas" };
  }
  datos.contactoWeb = {
    whatsapp: whatsappContacto,
    mensajeSinLugar: limpiarTexto(body.contactoWeb?.mensajeSinLugar, 300),
  };

  // ── WhatsApp ──
  const crudos = Array.isArray(body.whatsapp?.avisoLocal?.telefonos)
    ? body.whatsapp.avisoLocal.telefonos
    : String(body.whatsapp?.avisoLocal?.telefonos || "").split(/[,;\n]/);
  const telefonos = [...new Set(crudos.map((t) => limpiarTexto(t, 25)).filter(Boolean))];
  if (telefonos.length > 3) return { error: "Puedes poner hasta 3 números para el aviso por WhatsApp" };
  if (telefonos.some((t) => { const d = t.replace(/\D/g, ""); return d.length < 8 || d.length > 15; })) {
    return { error: "Revisa los números de WhatsApp del local" };
  }
  const horasWhatsapp = entero(body.whatsapp?.confirmacion?.horasAntes, 1, 24);
  if (!horasWhatsapp.ok) return { error: "Las horas para pedir confirmación por WhatsApp deben ser entre 1 y 24" };
  datos.whatsapp = {
    avisoLocal: { activo: !!body.whatsapp?.avisoLocal?.activo, telefonos },
    confirmacion: { activo: !!body.whatsapp?.confirmacion?.activo, horasAntes: horasWhatsapp.valor },
  };
  if (datos.whatsapp.avisoLocal.activo && !telefonos.length) {
    return { error: "Indica el número de WhatsApp que recibe el aviso de reservas nuevas" };
  }
  if (datos.whatsapp.confirmacion.activo && datos.whatsapp.confirmacion.horasAntes === null) {
    return { error: "Indica cuántas horas antes se pide la confirmación por WhatsApp" };
  }

  datos.permisosPersonal = {
    cancelar: !!body.permisosPersonal?.cancelar,
    forzarSobrecupo: !!body.permisosPersonal?.forzarSobrecupo,
  };

  if (datos.reservasWebActivas) {
    const faltan = faltantesConfiguracion(datos, CANAL_WEB).filter((f) => f !== "Reservas web activadas");
    if (faltan.length) {
      return { error: `Para activar las reservas web falta: ${faltan.join(", ")}` };
    }
    if (!datos.sectores.some((s) => s.activo && s.reservableOnline)) {
      return { error: "Para activar las reservas web, al menos un sector activo debe poder reservarse en línea" };
    }
  }

  return { datos };
};
