import empresaModel from "../models/empresa.model.js";

export const ingresarEmpresa = async (req, res) => {
  try {
    const {
      rutEmpresa,
      nombre,
      slug,
      tipo,
      logo,
      banner,
      descripcion,
      direccion,
      telefono,
      correo,
      profesional,
      redes,
      horarios,
    } = req.body;

    const empresa = await empresaModel.findOne({ rutEmpresa });
    if (empresa)
      return res
        .status(400)
        .json({ message: "La empresa ya se encuentra registrada" });

    const nuevaEmpresa = new empresaModel({
      rutEmpresa,
      nombre,
      slug,
      tipo,
      logo,
      banner,
      descripcion,
      direccion,
      telefono,
      correo,
      profesional,
      redes,
      horarios,
    });
    await nuevaEmpresa.save();
    return res.status(200).json({
      nuevaEmpresa
    })
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getEmpresaPorSlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const empresa = await empresaModel.findOne({ slug });
  
    if (!empresa) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    res.json(empresa);
  } catch (error) {
    console.error("Error en getEmpresaPorSlug:", error);
    res.status(500).json({ message: "Error del servidor", error });
  }
};

export const getEmpresaPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const empresa = await empresaModel.findById(id).select(
      "nombre slug logo banner direccion telefono"
    );

    if (!empresa) {
      return res.status(404).json({
        message: "Empresa no encontrada",
      });
    }

    res.json(empresa);
  } catch (error) {
    console.error("Error obtenerEmpresaPorId:", error);
    res.status(500).json({
      message: "Error interno del servidor",
    });
  }
};