import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import app from "./app.js";
import { connectDB } from "./database/db.js";
import { iniciarCronSuscripciones } from "./cron/suscripcionesCron.js";
import { iniciarJobReservas } from "./jobs/reservasEstado.js";

// Obtener el directorio actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Especificar la ruta exacta del .env (una carpeta arriba de src)
const envPath = path.resolve(__dirname, "..", ".env");


// Cargar dotenv con la ruta específica
dotenv.config({ path: envPath });

const PORT = process.env.PORT || 4000;

const startServer = async () => {
  await connectDB();

  //CRON
  iniciarCronSuscripciones();
  iniciarJobReservas();

  app.listen(PORT, "0.0.0.0", () => {
    
  });
};

startServer();
