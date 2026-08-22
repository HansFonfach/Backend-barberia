// Validación de RUT chileno (módulo 11) usada por los flujos públicos que
// reciben un RUT sin pasar por el front (ej. agendar clase de prueba sin
// cuenta). El front ya valida con la librería `rut.js`, pero como este es
// un endpoint público sin autenticación, igual lo validamos en el back
// para no confiar en lo que mande el cliente.

export const limpiarRut = (rut) =>
  String(rut || "")
    .replace(/[^0-9kK]/g, "")
    .toUpperCase();

export const esRutValido = (rut) => {
  const limpio = limpiarRut(rut);
  if (limpio.length < 2) return false;

  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;

  let suma = 0;
  let multiplo = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplo;
    multiplo = multiplo === 7 ? 2 : multiplo + 1;
  }

  const resto = 11 - (suma % 11);
  const dvEsperado = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  return dv === dvEsperado;
};

// Formato consistente para guardar en BD: "12345678-9"
export const formatearRut = (rut) => {
  const limpio = limpiarRut(rut);
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  return `${cuerpo}-${dv}`;
};
