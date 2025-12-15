import suscripcionModel from "../models/suscripcion.model.js";
import usuarioModel from "../models/usuario.model.js";

export const checkSuscripcion = async () => {
  const sus = await suscripcionModel.findOne({
    usuario: userId,
    activa: true,
  });

  if (!sus) return null;

  const ahora = new Date();

  if (sus.fechaFin < ahora) {
    sus.activa = false;
    sus.historial = true;
    await sus.save();

    await usuarioModel.findByIdAndUpdate(userId, { suscrito: false });
    return null;
  }
  return sus;
};
