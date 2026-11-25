// utils/edicionEmpresa.js
//
// Edición de un negocio desde el panel de super-admin ("Editar negocio").
// Arma los cambios a guardar a partir de lo que manda el formulario, con
// lista blanca de campos y validación. Es una función pura (sin base de
// datos) para poder probarla: test/edicionEmpresa.test.js.
//
// Reglas del plan:
//  - trial → activo (o suspendido/cancelado): la prueba deja de estar activa
//    y el cron de fin de prueba ya no lo toma en cuenta.
//  - a suspendido/cancelado: se marca desde cuándo (si no lo estaba ya).
//  - a trial/activo: se limpia la suspensión y su motivo.
//  - si se mueve la fecha de fin de prueba, sus avisos se pueden volver a mandar.
//  - si cambia el próximo pago, devuelve `cobro` para que el controlador
//    mueva/cree el cobro pendiente (PagoEmpresa) que usa el cron de avisos.
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { normalizarTelefonoCL } from "./telefono.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export const ZONA_PAGOS = "America/Santiago";
export const ESTADOS_SUSCRIPCION = ["trial", "activo", "suspendido", "cancelado"];
const BLOQUEANTES = ["suspendido", "cancelado"];

// Módulos que se pueden prender/apagar desde el panel
export const MODULOS_EDITABLES = [
  "canchas",
  "reservasMesas",
  "clasesGrupales",
  "entrenamientoPersonal",
  "fichaClinica",
  "historialControles",
  "planAlimentario",
  "examenesLab",
];

const TEXTOS = {
  nombre: 80,
  ciudad: 60,
  direccion: 160,
  rutEmpresa: 20,
  notasSuperAdmin: 1000,
  motivoSuspension: 200,
};

const esEmailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

/** "YYYY-MM-DD" (hora de Chile) → Date. "" / null → null. Formato malo → undefined. */
export const fechaChile = (valor, hora = "12:00") => {
  if (valor === null || valor === "" || valor === undefined) return null;
  const s = String(valor).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = dayjs.tz(`${s} ${hora}`, "YYYY-MM-DD HH:mm", ZONA_PAGOS);
  return d.isValid() && d.format("YYYY-MM-DD") === s ? d.toDate() : undefined;
};

/** Date → "YYYY-MM-DD" en hora de Chile (null si no hay fecha). */
export const diaChile = (fecha) => (fecha ? dayjs(fecha).tz(ZONA_PAGOS).format("YYYY-MM-DD") : null);

/** Misma convención que los cobros existentes: "mes" = mes del vencimiento − 1. */
export const mesAnioCobro = (fecha) => {
  const vence = dayjs(fecha).tz(ZONA_PAGOS);
  return vence.month() === 0
    ? { mes: 12, anio: vence.year() - 1 }
    : { mes: vence.month(), anio: vence.year() };
};

export const construirCambiosEmpresa = (body = {}, actual = {}, { rubrosValidos = [], ahora = new Date() } = {}) => {
  const set = {};
  const errores = [];
  const viene = (k) => Object.prototype.hasOwnProperty.call(body, k);

  // ── Datos del negocio ──
  for (const [campo, max] of Object.entries(TEXTOS)) {
    if (viene(campo)) set[campo] = String(body[campo] ?? "").trim().slice(0, max);
  }
  if (viene("nombre") && set.nombre.length < 2) errores.push("El nombre del negocio es muy corto");

  if (viene("rubro")) {
    if (rubrosValidos.includes(body.rubro)) set.rubro = body.rubro;
    else errores.push("Rubro inválido");
  }
  if (viene("correo")) {
    const correo = String(body.correo ?? "").trim().toLowerCase();
    if (correo && !esEmailValido(correo)) errores.push("El correo no es válido");
    else set.correo = correo;
  }
  if (viene("telefono")) set.telefono = normalizarTelefonoCL(String(body.telefono ?? "").trim()) || "";
  if (viene("estado")) {
    if (["activo", "inactivo"].includes(body.estado)) set.estado = body.estado;
    else errores.push("Estado inválido");
  }

  // ── Cobro ──
  if (viene("cuotaMensual")) {
    const n = Number(body.cuotaMensual);
    if (body.cuotaMensual === "" || body.cuotaMensual === null || Number.isNaN(n) || n < 0) {
      errores.push("La cuota mensual no es válida");
    } else set.cuotaMensual = Math.round(n);
  }
  if (viene("fechaPago")) {
    if (body.fechaPago === "" || body.fechaPago === null) set.fechaPago = null;
    else {
      const dia = Number(body.fechaPago);
      if (Number.isInteger(dia) && dia >= 1 && dia <= 31) set.fechaPago = dia;
      else errores.push("El día de pago debe ser un número del 1 al 31");
    }
  }
  for (const [campo, texto] of [["ultimoPago", "último pago"], ["proximoPago", "próximo pago"]]) {
    if (!viene(campo)) continue;
    const f = fechaChile(body[campo]);
    if (f === undefined) errores.push(`La fecha de ${texto} no es válida`);
    else set[campo] = f;
  }

  // Si no tenía día de pago, se toma el del próximo pago (lo usa "Marcar pago")
  const diaFinal = viene("fechaPago") ? set.fechaPago : actual.fechaPago;
  if (set.proximoPago && !diaFinal) set.fechaPago = Number(dayjs(set.proximoPago).tz(ZONA_PAGOS).format("D"));

  // ── Prueba gratis ──
  if (viene("finPrueba")) {
    const fin = fechaChile(body.finPrueba, "23:59");
    if (!fin) errores.push("La fecha de fin de prueba no es válida");
    else if (diaChile(fin) !== diaChile(actual.trial?.fin)) {
      set["trial.fin"] = fin;
      set["trial.avisoPrevio"] = null;
      set["trial.avisoVencido"] = null;
    }
  }

  // ── Estado del plan ──
  if (viene("estadoSuscripcion")) {
    const nuevo = body.estadoSuscripcion;
    if (!ESTADOS_SUSCRIPCION.includes(nuevo)) errores.push("Estado del plan inválido");
    else {
      set.estadoSuscripcion = nuevo;
      set["trial.activo"] = nuevo === "trial";
      set.plan = nuevo === "trial" ? "trial" : nuevo === "activo" ? "activo" : "vencido";
      if (BLOQUEANTES.includes(nuevo)) {
        if (!BLOQUEANTES.includes(actual.estadoSuscripcion)) set.suspendidaDesde = ahora;
      } else {
        set.suspendidaDesde = null;
        set.motivoSuspension = "";
      }
    }
  }

  // ── Módulos y opciones ──
  for (const campo of ["moduloProductos", "permiteSuscripcion", "directorioVisible"]) {
    if (viene(campo)) set[campo] = body[campo] === true || body[campo] === "true";
  }
  if (body.modulos && typeof body.modulos === "object") {
    for (const m of MODULOS_EDITABLES) {
      if (Object.prototype.hasOwnProperty.call(body.modulos, m)) set[`modulos.${m}`] = body.modulos[m] === true;
    }
  }

  // ── ¿Hay que mover el cobro pendiente? ──
  let cobro = null;
  if (viene("proximoPago") && set.proximoPago !== undefined && diaChile(set.proximoPago) !== diaChile(actual.proximoPago)) {
    cobro = set.proximoPago ? { accion: "mover", fecha: set.proximoPago } : { accion: "cancelar" };
  }

  return { set, errores, cobro };
};
