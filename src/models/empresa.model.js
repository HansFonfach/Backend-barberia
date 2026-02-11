import mongoose from "mongoose";

const EmpresaSchema = new mongoose.Schema({
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
  redes: {
    instagram: String,
    facebook: String,
    tiktok: String,
  },
  horarios: {
    // horarios por día
    lunes: String,
    martes: String,
    miercoles: String,
    jueves: String,
    viernes: String,
    sabado: String,
    domingo: String,
  },
  servicios: [
    // array de servicios con nombre y precio
    {
      nombre: String,
      precio: Number,
      duracionMinutos: Number, // opcional
    },
  ],
  creadoEn: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Empresa", EmpresaSchema);
