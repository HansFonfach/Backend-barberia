import empresaModel from "../models/empresa.model.js";

export const ingresarEmpresa = async (req, res) => {
  try {
    const {
      rutEmpresa,
      nombre,
      slug,
      tipo,
      descripcion,
      direccion,
      telefono,
      correo,
      profesional,
      redes,
      horarios,
    } = req.body;

    const empresaExiste = await empresaModel.findOne({ rutEmpresa });
    if (empresaExiste) {
      return res.status(400).json({
        message: "La empresa ya se encuentra registrada",
      });
    }

    let logoUrl = "";
    let bannerUrl = "";

    if (req.files?.logo) {
      const result = await cloudinary.uploader.upload_stream({
        resource_type: "image",
      });
    }

    if (req.files?.logo) {
      const uploadedLogo = await cloudinary.uploader.upload(
        req.files.logo[0].path,
      );
      logoUrl = uploadedLogo.secure_url;
    }

    if (req.files?.banner) {
      const uploadedBanner = await cloudinary.uploader.upload(
        req.files.banner[0].path,
      );
      bannerUrl = uploadedBanner.secure_url;
    }

    const nuevaEmpresa = new empresaModel({
      rutEmpresa,
      nombre,
      slug,
      tipo,
      logo: logoUrl,
      banner: bannerUrl,
      descripcion,
      direccion,
      telefono,
      correo,
      profesional,
      redes,
      horarios,
    });

    await nuevaEmpresa.save();

    res.status(200).json({ nuevaEmpresa });
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

    const empresa = await empresaModel
      .findById(id)
      .select("nombre slug logo banner direccion telefono");

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

export const actualizarLogoEmpresa = async (req, res) => {
  try {
    const { empresaId } = req.params;
    const { logo } = req.body;

    if (!logo) {
      return res.status(400).json({ message: "Debes enviar la URL del logo" });
    }

    const empresaActualizada = await empresaModel.findByIdAndUpdate(
      empresaId,
      { logo: logo }, // ahora usa la URL que envías
      { new: true },
    );

    if (!empresaActualizada) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    res.status(200).json(empresaActualizada);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const actualizarEmpresa = async (req, res) => {
  try {
    const empresaId = req.usuario?.empresaId;

    if (!empresaId) {
      return res.status(403).json({ message: "No autorizado" });
    }

    const camposProtegidos = [
      "rutEmpresa",
      "slug",
      "tipo",
      "configuracion",
      "permiteSuscripcion",
    ];
    camposProtegidos.forEach((campo) => delete req.body[campo]);

    const empresaActualizada = await empresaModel.findByIdAndUpdate(
      empresaId,
      { $set: req.body },
      { new: true, runValidators: true },
    );

    if (!empresaActualizada) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    res.status(200).json(empresaActualizada);
  } catch (error) {
    console.error("❌ Error actualizarEmpresa:", error);
    res.status(500).json({ message: error.message });
  }
};
