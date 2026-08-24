import mongoose from "mongoose";

const { Schema } = mongoose;

// Contador atómico de cupo ocupado por sesión puntual (clase + fecha exacta).
// Existe SOLO para poder reservar un cupo con una operación atómica de Mongo
// ($inc condicionado a que "reservados" siga bajo el cupo vigente) en vez de
// "contar inscripciones y después crear", que es una condición de carrera:
// dos personas pidiendo el último cupo al mismo tiempo podían pasar ambas la
// validación y sobrevender el cupo. Ver helpers/cupoSesionHelper.js.
const CupoSesionSchema = new Schema(
  {
    clase: {
      type: Schema.Types.ObjectId,
      ref: "Clase",
      required: true,
      index: true,
    },
    fecha: { type: Date, required: true },
    reservados: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

CupoSesionSchema.index({ clase: 1, fecha: 1 }, { unique: true });

export default mongoose.model("CupoSesion", CupoSesionSchema);
