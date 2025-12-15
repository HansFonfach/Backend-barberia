import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import app from "./app.js";
import { connectDB } from "./database/db.js";
import { iniciarCronSuscripciones } from "./cron/suscripcionesCron.js";

// Obtener el directorio actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Especificar la ruta exacta del .env (una carpeta arriba de src)
const envPath = path.resolve(__dirname, "..", ".env");
console.log("📁 Buscando .env en:", envPath);

// Cargar dotenv con la ruta específica
dotenv.config({ path: envPath });

const PORT = process.env.PORT || 4000;

const startServer = async () => {
  await connectDB();

  iniciarCronSuscripciones();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`🌐 Accesible desde tu red en: http://192.168.X.X:${PORT}`);
  });
};

startServer();
