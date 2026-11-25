import rateLimit from "express-rate-limit";

// Límite básico para endpoints públicos (sin login) que escriben en la base
// de datos: crear una solicitud de membresía, inscribirse a una clase, buscar
// un RUT. Antes de este cambio ninguno de estos endpoints tenía ningún
// control de abuso; con más flujos públicos (checkout de plan, reserva sin
// login) conviene al menos un tope simple por IP. No reemplaza un WAF ni
// protege contra IPs rotativas, pero frena el caso simple de un script
// mandando cientos de solicitudes.
export const limitarEscrituraPublica = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 20, // 20 intentos por IP en la ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Demasiados intentos. Espera unos minutos y vuelve a intentar.",
  },
});

// Registro de negocios nuevos: crea una empresa y manda un correo, así que
// el tope es bajo (5 por hora por IP) para que nadie llene la base de
// negocios falsos ni use el correo de Agenda Fonfach para spam.
export const limitarRegistroNegocio = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Hiciste varios intentos seguidos. Espera un rato y vuelve a intentar." },
});

// Límite más laxo para endpoints públicos de solo lectura (ver planes,
// horarios, etc.) — igual conviene un tope alto para que un scraper agresivo
// no sature el servidor.
export const limitarLecturaPublica = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiadas solicitudes. Intenta de nuevo más tarde." },
});
