export const generarHoras = ({ horaInicio, horaFin }) => {
  const [hIni, mIni] = horaInicio.split(":").map(Number);
  const [hFin, mFin] = horaFin.split(":").map(Number);

  const horas = [];
  const inicio = hIni * 60 + mIni;
  const fin = hFin * 60 + mFin;

  for (let m = inicio; m < fin; m += 60) {
    const h = String(Math.floor(m / 60)).padStart(2, "0");
    const min = String(m % 60).padStart(2, "0");
    horas.push(`${h}:${min}`);
  }
  horas.push(
    `${String(hFin).padStart(2, "0")}:${String(mFin).padStart(2, "0")}`
  );

  // añadir hora final manualmente

  return horas;
};

// 🔹 Normaliza distintos formatos de hora a "HH:mm"
export const formatHora = (hora) => {
  if (!hora) return null;

  if (typeof hora === "string") {
    const m = hora.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);
    if (m) {
      const hh = m[1].padStart(2, "0");
      const mm = m[2].padStart(2, "0");
      return `${hh}:${mm}`;
    }

    const m2 = hora.match(/^(\d{2})(\d{2})$/);
    if (m2) {
      return `${m2[1]}:${m2[2]}`;
    }

    throw new Error(`Formato de hora inválido: ${hora}`);
  }

  if (typeof hora === "number") {
    const hh = Math.floor(hora);
    const mm = Math.round((hora - hh) * 60);
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  throw new Error("Tipo de hora no soportado");
};

// 🔹 Crea límites del día en UTC para una fecha
export const crearFechasUTC = (fecha) => {
  const startOfDay = new Date(fecha);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const endOfDay = new Date(fecha);
  endOfDay.setUTCHours(23, 59, 59, 999);

  return { startOfDay, endOfDay };
};
