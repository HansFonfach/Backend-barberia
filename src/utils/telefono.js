// utils/telefono.js
//
// Deja los celulares chilenos siempre como 569XXXXXXXX (11 dígitos), venga
// como venga: "75297584", "975297584", "+56 9 7529 7584", "56975297584"...
// Antes se le pegaba "569" adelante sin mirar, y si la persona escribía el
// 9 inicial quedaba "5699..." (12 dígitos) y el WhatsApp no llegaba.
// Otros formatos (fijos, extranjeros) se dejan como vienen, solo con dígitos.
export const normalizarTelefonoCL = (valor) => {
  if (valor === undefined || valor === null) return valor;
  const d = String(valor).replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 8) return `569${d}`;
  if (d.length === 9 && d.startsWith("9")) return `56${d}`;
  if (d.length === 11 && d.startsWith("569")) return d;
  if (d.length === 12 && d.startsWith("5699")) return `569${d.slice(-8)}`;
  return d;
};
