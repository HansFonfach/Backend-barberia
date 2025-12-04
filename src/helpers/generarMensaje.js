export const generarMensajeEstado = (
  diasDesdeUltima,
  promedioCliente,
  tipo
) => {
  if (!promedioCliente) {
    return `Aún no tenemos suficiente información para calcular tu frecuencia de ${tipo}.`;
  }

  if (diasDesdeUltima < promedioCliente * 0.6) {
    return `🔥 Tu ${tipo} sigue en excelente forma. Aún no necesitas reservar.`;
  }

  if (diasDesdeUltima < promedioCliente) {
    return `👍 Tu ${tipo} comienza a perder forma. Usualmente vienes cada ${promedioCliente} días. Podrías considerar reservar pronto.`;
  }

  return `🟥 Ya van ${diasDesdeUltima} días desde tu último ${tipo}. Tu promedio es ${promedioCliente} días. Este es un buen momento para reservar.`;
};
