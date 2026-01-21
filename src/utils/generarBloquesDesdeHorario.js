export const generarBloquesDesdeHorario = (horario) => {
  const { horaInicio, horaFin, colacionInicio, colacionFin, duracionBloque } =
    horario;

  const bloques = [];

  const toMinutes = (hora) => {
    const [h, m] = hora.split(":").map(Number);
    return h * 60 + m;
  };

  const toHora = (min) => {
    const h = String(Math.floor(min / 60)).padStart(2, "0");
    const m = String(min % 60).padStart(2, "0");
    return `${h}:${m}`;
  };

  let inicio = toMinutes(horaInicio);
  const fin = toMinutes(horaFin);

  const colacionIni = colacionInicio ? toMinutes(colacionInicio) : null;
  const colacionFinMin = colacionFin ? toMinutes(colacionFin) : null;

  while (inicio + duracionBloque <= fin) {
    const bloqueFin = inicio + duracionBloque;

    // ❌ Saltar colación
    if (
      colacionIni !== null &&
      inicio < colacionFinMin &&
      bloqueFin > colacionIni
    ) {
      inicio = colacionFinMin;
      continue;
    }

    bloques.push({
      hora: toHora(inicio),
      disponible: true,
    });

    inicio = bloqueFin;
  }

  return bloques;
};
