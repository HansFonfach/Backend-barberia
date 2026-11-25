// utils/pruebaGratis.js
//
// Período de prueba de los negocios nuevos (7 días). Funciones puras para
// decidir qué aviso corresponde; las usa cron/pruebaGratisCron.js y se
// prueban solas en test/pruebaGratis.test.js.
//
// Solo se AVISA (al negocio y a Hans): no se suspende nada automáticamente.
// La suspensión la decide Hans desde su panel de super-admin.

export const DIAS_PRUEBA = 7;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Fecha de fin de una prueba que empieza `inicio`. */
export const finDePrueba = (inicio = new Date()) => new Date(new Date(inicio).getTime() + DIAS_PRUEBA * DIA_MS);

/** Días que faltan (redondeado hacia arriba; 0 = vence hoy, negativo = vencida). */
export const diasRestantesPrueba = (fin, ahora = new Date()) => Math.ceil((new Date(fin).getTime() - new Date(ahora).getTime()) / DIA_MS);

/**
 * Qué aviso le toca hoy a una empresa: "previo" (le quedan 1–2 días),
 * "vencido" (venció hace menos de 3 días) o null.
 * La ventana corta del "vencido" evita mandarle "tu prueba venció" a negocios
 * antiguos que siguen marcados como prueba pero que ya son clientes.
 */
export const avisoPruebaPendiente = (empresa, ahora = new Date()) => {
  if (!empresa || empresa.estadoSuscripcion !== "trial" || empresa.estado === "inactivo") return null;
  const fin = empresa.trial?.fin;
  if (!fin) return null;
  const msRestantes = new Date(fin).getTime() - new Date(ahora).getTime();
  if (msRestantes > 0 && msRestantes <= 2 * DIA_MS) return empresa.trial?.avisoPrevio ? null : "previo";
  if (msRestantes <= 0 && msRestantes > -3 * DIA_MS) return empresa.trial?.avisoVencido ? null : "vencido";
  return null;
};
