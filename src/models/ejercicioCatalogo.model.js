import mongoose from "mongoose";

const { Schema } = mongoose;

// Catálogo de máquinas/ejercicios de una empresa, para autocompletar al
// registrar entrenamiento. No existe una API pública confiable de
// "máquinas de gimnasio" (cada gimnasio tiene marcas y equipos distintos),
// así que en vez de eso este catálogo se arma solo: cada vez que alguien
// registra un ejercicio con un nombre nuevo, queda guardado acá para que
// el resto de la empresa (los amigos invitados) lo vea sugerido después,
// en vez de tener que escribirlo de cero.
const EjercicioCatalogoSchema = new Schema(
  {
    empresa: {
      type: Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
      index: true,
    },
    nombre: { type: String, required: true, trim: true, maxlength: 80 },
    // Minúsculas sin espacios extra, para poder exigir que no se repita el
    // mismo ejercicio con mayúsculas/espacios distintos.
    nombreNormalizado: { type: String, required: true, trim: true, lowercase: true },
  },
  { timestamps: true },
);

EjercicioCatalogoSchema.index({ empresa: 1, nombreNormalizado: 1 }, { unique: true });

export default mongoose.model("EjercicioCatalogo", EjercicioCatalogoSchema);
