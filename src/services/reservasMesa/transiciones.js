// Máquina de estados de una reserva de mesa. Es el ÚNICO lugar donde se
// decide qué cambio de estado se permite y qué estados ocupan cupo: el
// controlador, la página pública y el front leen de acá. Funciones puras.

export const TRANSICIONES = {
  pendiente: ["confirmada", "llego", "cancelada"],
  confirmada: ["llego", "cancelada", "no_asistio"],
  llego: ["completada"],
  // Corrección: se marcó "no asistió" pero el cliente llegó tarde.
  no_asistio: ["llego"],
  completada: [],
  cancelada: [],
};

// Mientras la reserva está en uno de estos estados, sus personas ocupan cupo.
export const ESTADOS_QUE_OCUPAN = ["pendiente", "confirmada", "llego"];

// En estos estados se pueden editar los datos (personas, hora, sector...).
export const ESTADOS_EDITABLES = ["pendiente", "confirmada", "llego"];

export const ESTADOS_FINALES = ["completada", "cancelada"];

export const puedeTransicionar = (desde, hacia) =>
  (TRANSICIONES[desde] || []).includes(hacia);

export const ocupaCupo = (estado) => ESTADOS_QUE_OCUPAN.includes(estado);

/**
 * Valida un cambio de estado con las reglas extra de cada caso.
 * @returns {{ok:true} | {ok:false, mensaje:string}}
 */
export const validarCambioEstado = ({ reserva, hacia, motivo, hoy }) => {
  if (reserva.estado === hacia) {
    return { ok: false, mensaje: "La reserva ya está en ese estado" };
  }
  if (!puedeTransicionar(reserva.estado, hacia)) {
    return {
      ok: false,
      mensaje: `No se puede pasar de "${reserva.estado}" a "${hacia}"`,
    };
  }
  if (hacia === "cancelada" && !motivo) {
    return { ok: false, mensaje: "Indica el motivo de la cancelación" };
  }
  if (reserva.estado === "no_asistio" && hacia === "llego") {
    if (reserva.fecha !== hoy) {
      return {
        ok: false,
        mensaje: "Solo se puede corregir un \"no asistió\" el mismo día de la reserva",
      };
    }
    if (!motivo) {
      return { ok: false, mensaje: "Indica por qué se corrige el \"no asistió\"" };
    }
  }
  return { ok: true };
};
