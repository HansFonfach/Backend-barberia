import mongoose from "mongoose";

const { Schema } = mongoose;

// Suplemento que una persona sigue (ej: "Creatina", "Proteína") dentro del
// diario alimenticio (modulos.entrenamientoPersonal) — solo la lista de
// QUÉ sigue, no el registro de si lo tomó cada día (eso es
// TomaSuplemento). activo=false en vez de borrar, para no perder el
// historial de tomas pasadas si en algún momento deja de seguirlo.
const SuplementoUsuarioSchema = new Schema(
  {
    empresa: {
      type: Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
      index: true,
    },
    cliente: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
      index: true,
    },

    nombre: { type: String, required: true, trim: true, maxlength: 60 },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true },
);

SuplementoUsuarioSchema.index({ empresa: 1, cliente: 1, activo: 1 });

export default mongoose.model("SuplementoUsuario", SuplementoUsuarioSchema);
