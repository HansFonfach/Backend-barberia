import cron from "node-cron";
import Empresa from "../models/empresa.model.js";
import Usuario from "../models/usuario.model.js";
import { calcularProgresoEntrenamiento } from "../controllers/entrenamientoPersonalController.js";
import { sendAvisoEntrenamientoPersonalEmail } from "../controllers/mailController.js";

// Cron del módulo de entrenamiento personal (modulos.entrenamientoPersonal):
// todos los días a las 9:00 AM (hora de Chile) le manda a cada usuario de
// cada empresa con el módulo activo un correo con la sugerencia del día
// (o descanso) + racha + aviso de constancia si corresponde. Simétrico
// para todos los usuarios de la empresa (dueño y amigos invitados), no
// solo rol "cliente" — este módulo es de uso personal para cualquiera que
// se haya registrado.

const BASE_URL = "https://www.agendafonfach.cl";

const enviarAvisosDeEmpresa = async (empresa) => {
  const usuarios = await Usuario.find({
    empresa: empresa._id,
    estado: "activo",
    deletedAt: null,
    rol: { $ne: "invitado" },
    email: { $exists: true, $ne: "" },
  }).select("nombre email");

  for (const usuario of usuarios) {
    try {
      const progreso = await calcularProgresoEntrenamiento(empresa._id, usuario._id);

      await sendAvisoEntrenamientoPersonalEmail(usuario.email, {
        nombreCliente: usuario.nombre,
        nombreEmpresa: empresa.nombre,
        sugerencia: progreso.sugerencia,
        rachaSemanas: progreso.rachaSemanas,
        avisoConstancia: progreso.avisoConstancia,
        diasSinActividad: progreso.diasSinActividad,
        linkRegistrar: `${BASE_URL}/${empresa.slug}/admin/mi-entrenamiento`,
      });
    } catch (error) {
      console.error(
        `❌ Error enviando aviso de entrenamiento a ${usuario.email}:`,
        error.message,
      );
    }
  }
};

const procesarAvisosEntrenamientoPersonal = async () => {
  const empresas = await Empresa.find({ "modulos.entrenamientoPersonal": true });

  for (const empresa of empresas) {
    await enviarAvisosDeEmpresa(empresa);
  }
};

export const iniciarCronEntrenamientoPersonal = () => {
  cron.schedule(
    "0 9 * * *", // todos los días a las 9:00 AM (hora de Chile)
    async () => {
      try {
        await procesarAvisosEntrenamientoPersonal();
        console.log("✅ Cron de entrenamiento personal ejecutado correctamente");
      } catch (error) {
        console.error("❌ Error en cron de entrenamiento personal:", error);
      }
    },
    { timezone: "America/Santiago" },
  );
};
