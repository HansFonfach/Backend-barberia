import express from "express";
import cors from "cors";

import usuarioRoutes from "./routes/usuarioRoutes.js";
import horarioRoutes from "./routes/horarioRoutes.js";
import servicioRoutes from "./routes/servicioRoutes.js";
import reservasRoutes from "./routes/reservaRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import suscripcionRoutes from "./routes/suscripcionRoutes.js";
import excepcionRoutes from "./routes/excepcionHorario.js";
import estadisticasRoutes from "./routes/estadisticasRoutes.js";
import webhookRoutes from "./routes/webhooksRoutes.js";
import cookieParser from "cookie-parser";
import testRoutes from "./routes/testRoutes.js";
import feriadoRoutes from "./routes/feriadoRoutes.js";
import RecordatoriosJob from "./jobs/recordatoriosJob.js";
import notificacionRoutes from "./routes/notificacionRoutes.js";
import pagosRoutes from "./routes/pagoRoutes.js";
import canjeRoutes from "./routes/canjeRoutes.js";
import barberoServicioRoutes from "./routes/barberoServicioRoutes.js";
import reservaInvitadoRoutes from "./routes/reservaInvitadoRoutes.js";
import empresaRoutes from "./routes/empresaRoutes.js";

const app = express();

// 🟢 1. TRUST PROXY (importante para HTTPS en Render)
app.set('trust proxy', 1);

// 🟢 2. COOKIE PARSER
app.use(cookieParser());

// 🟢 3. CONFIGURACIÓN CORS ÚNICA Y COMPLETA (RECOMENDADA)
// Dominios permitidos (frontend Render + localhost)
const allowedOrigins = [
  "https://www.agendafonfach.cl",
  "https://agendafonfach.cl",
  "https://frontend-barberia-tcv6.onrender.com",
  "http://localhost:3000",
  "http://localhost:5173",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Permitir requests sin origin (ej: Postman, móviles)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // ✅ permite enviar cookies
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Origin",
      "X-Requested-With",
      "X-CSRF-Token"
    ],
    exposedHeaders: ["Set-Cookie"], // importante para leer cookies en frontend
  })
);

// 🟢 NOTA: NO es necesario app.options('*', cors()) ni app.options('/*', cors())
// porque app.use(cors()) ya maneja automáticamente las peticiones OPTIONS (preflight)
// para TODAS las rutas. ¡Eliminamos la línea que causaba el error!

// 🟢 4. MIDDLEWARE PARA LOGGING (opcional, útil para debug)
app.use((req, res, next) => {
  console.log(`📱 [${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// 🟢 5. MIDDLEWARE PARA JSON Y URLENCODED
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🟢 6. INICIAR JOBS
RecordatoriosJob.init();

// 🟢 7. RUTA RAÍZ
app.get("/", (req, res) => {
  res.send("API Barbería funcionando 🚀");
});

console.log("🕐 Hora backend:", new Date());

// 🟢 8. RUTAS DE LA API
app.use("/usuarios", usuarioRoutes);
app.use("/horarios", horarioRoutes);
app.use("/servicios", servicioRoutes);
app.use("/reservas", reservasRoutes);
app.use("/auth", authRoutes);
app.use("/suscripcion", suscripcionRoutes);
app.use("/excepcionHorario", excepcionRoutes);
app.use("/estadisticas", estadisticasRoutes);
app.use("/webhook", webhookRoutes);
app.use("/test", testRoutes);
app.use("/feriados", feriadoRoutes);
app.use("/notificaciones", notificacionRoutes);
app.use("/pagos", pagosRoutes);
app.use("/canjes", canjeRoutes);
app.use("/barberoServicio", barberoServicioRoutes);
app.use("/reserva/invitado", reservaInvitadoRoutes);
app.use("/empresa", empresaRoutes);

// 🟢 9. MIDDLEWARE DE ERRORES GLOBAL (opcional pero recomendado)
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      message: 'Acceso no permitido por CORS',
      origin: req.headers.origin
    });
  }
  
  res.status(500).json({
    message: 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export default app;