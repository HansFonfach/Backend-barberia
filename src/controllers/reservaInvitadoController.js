import empresaModel from "../models/empresa.model.js";
import usuarioModel from "../models/usuario.model.js";
import { createReserva } from "./reservaController.js";

export const reservarComoInvitado = async (req, res) => {
  const { slug } = req.params;
  const { nombre, apellido, rut, email, telefono } = req.body;

  const empresa = await empresaModel.findOne({ slug });
  if (!empresa)
    return res.status(404).json({ message: "Empresa no encontrada" });

  let usuario = await usuarioModel.findOne({
    email,
    empresa: empresa._id,
  });

  if (!usuario) {
    usuario = await usuarioModel.create({
      nombre,
      apellido,
      rut,
      email,
      telefono,
      rol: "invitado",
      empresa: empresa._id,
    });
  }

  req.usuario = {
    id: usuario._id,
    empresaId: empresa._id,
    rol: usuario.rol,
  };

  return createReserva(req, res);
};
