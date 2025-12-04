export const calcularPromedioDias = (fechas = []) => {
  if (!Array.isArray(fechas) || fechas.length < 2) return null;

  let diferencias = [];

  for (let i = 1; i < fechas.length; i++) {
    const diff = (fechas[i] - fechas[i - 1]) / (1000 * 60 * 60 * 24);

    if (diff > 0) diferencias.push(diff); // ⛔ evitamos negativos
  }

  if (diferencias.length === 0) return null;

  const suma = diferencias.reduce((a, b) => a + b, 0);

  return Math.round(suma / diferencias.length);
};