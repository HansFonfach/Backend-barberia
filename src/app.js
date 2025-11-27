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

// ✅ AHORA SÍ PUEDE IMPORTARSE DESPUÉS DE QUE DOTENV SE CARGÓ EN INDEX.JS
import RecordatoriosJob from "./jobs/recordatoriosJob.js";

const app = express();
app.use(cookieParser());

const allowedOrigins = [
  "https://frontend-barberia-tcv6.onrender.com",
  "http://localhost:3000",
  "https://frontend-barberia-tcv6.onrender.com/", // por si acaso
];

// ✅ CORRECCIÓN: Configuración simplificada de CORS
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"]
}));

// ✅ ELIMINAR completamente la línea problemática
// NO usar: app.options("*", ...)

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ INICIAR JOBS - AHORA CON VARIABLES CARGADAS
RecordatoriosJob.init();

// Rutas
app.get("/", (req, res) => {
  res.send("API Barbería funcionando 🚀");
});

console.log("Hora backend:", new Date());

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

export default app;