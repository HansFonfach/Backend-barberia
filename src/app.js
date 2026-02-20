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
app.use(cookieParser());

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
      // Permitir requests sin origin (ej: Postman)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // ✅ permite enviar cookies
    methods: "GET,POST,PUT,DELETE,PATCH,OPTIONS",
    allowedHeaders:
      "Content-Type,Authorization,Accept,Origin,X-Requested-With,X-CSRF-Token",
    exposedHeaders: "Set-Cookie", // importante para leer cookies en frontend
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

RecordatoriosJob.init();

// Rutas
app.get("/", (req, res) => {
  res.send("API Barbería funcionando 🚀");
});



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
app.use("/empresa", empresaRoutes)

export default app;
