import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const PORT = process.env.PORT || 4000;
const BASE_URL = process.env.INTERNAL_API_URL || `http://localhost:${PORT}`;

/**
 * Busca, día por día (hasta `maxDias`), la fecha más cercana en que
 * la `horaFavorita` del cliente esté realmente disponible para ese
 * barbero + servicio. Usa el endpoint público de horas disponibles.
 *
 * @returns { fecha: "DD-MM-YYYY", hora: "HH:mm" } | null si no encontró nada
 */
export const buscarSlotDisponible = async ({
  barberoId,
  servicioId,
  horaFavorita,
  maxDias = 14,
}) => {
  if (!barberoId || !servicioId || !horaFavorita) return null;

  const hoy = dayjs().tz("America/Santiago");

  for (let i = 1; i <= maxDias; i++) {
    const fecha = hoy.add(i, "day").format("YYYY-MM-DD");

    try {
      const url = `${BASE_URL}/horarios/barbero/${barberoId}/horas-disponibles?fecha=${fecha}&servicioId=${servicioId}`;
      const res = await fetch(url);

      if (!res.ok) continue;

      const data = await res.json();
      const horas = data?.horas || [];

      const match = horas.find(
        (h) => h.hora === horaFavorita && h.estado === "disponible",
      );

      if (match) {
        return {
          fecha: dayjs.tz(fecha, "YYYY-MM-DD", "America/Santiago").format("DD-MM-YYYY"),
          hora: horaFavorita,
        };
      }
    } catch (err) {
      console.error(`❌ Error consultando disponibilidad (${fecha}):`, err.message);
      continue;
    }
  }

  return null;
};