import mongoose from "mongoose";

const EmpresaSchema = new mongoose.Schema({
  rutEmpresa: {
    type: String,
    required: true,
  },
  nombre: {
    type: String,
    required: true,
  },
  slug: {
    // clave única para la URL
    type: String,
    required: true,
    unique: true,
  },
  tipo: {
    // barberia | peluqueria | salon_belleza
    type: String,
    required: true,
  },
  logo: String, // url o path de la imagen
  banner: String, // url o path de imagen grande
  descripcion: String,
  direccion: String,
  telefono: String,
  correo: String,
  profesional: String,
  redes: {
    instagram: String,
    facebook: String,
    tiktok: String,
  },
  horarios: String,

  creadoEn: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Empresa", EmpresaSchema);
