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
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: "GET,POST,PUT,DELETE,PATCH",
    allowedHeaders: "Content-Type,Authorization",
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ INICIAR JOBS - AHORA CON VARIABLES CARGADAS
RecordatoriosJob.init();

// Rutas
app.get("/", (req, res) => {
  res.send("API Barbería funcionando 🚀");
});

app.use((req, res, next) => {
  console.log("Origin:", req.headers.origin);
  res.header("Access-Control-Allow-Credentials", "true");
  next();
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
