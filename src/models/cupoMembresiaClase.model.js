import mongoose from "mongoose";

const { Schema } = mongoose;

// Contador atómico de clases usadas dentro de UN CICLO de una mensualidad de
// clases (MembresiaClase). Mismo problema y misma solución que
// CupoSesion/cupoSesionHelper.js, pero aplicado al cupo de clases del plan
// en vez de al cupo de la sesión: "contar InscripcionClase y luego crear" es
// una condición de carrera (dos reservas simultáneas del mismo cliente, o
// dos pestañas, podían pasar ambas la validación de "me quedan clases" y
// dejarlo con -1 clases). Se mantiene un contador propio por (membresia,
// cicloClave) que solo se incrementa si sigue bajo clasesIncluidas, en una
// única operación atómica de Mongo ($inc condicionado con $lt).
//
// cicloClave identifica el ciclo de conteo vigente para la fecha de la
// sesión que se está reservando (ver obtenerRangoConteo en
// helpers/contarClasesUsadasMembresia.js): para tipoCiclo "total" es fijo
// para toda la mensualidad; para "mensual" cambia cada 30 días desde
// fechaInicio. Así, una mensualidad "mensual" tiene un documento distinto
// por cada ciclo de 30 días en el que efectivamente se reservaron clases.
const CupoMembresiaClaseSchema = new Schema(
  {
    membresia: {
      type: Schema.Types.ObjectId,
      ref: "MembresiaClase",
      required: true,
      index: true,
    },
    cicloClave: { type: String, required: true },
    reservados: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

CupoMembresiaClaseSchema.index({ membresia: 1, cicloClave: 1 }, { unique: true });

export default mongoose.model("CupoMembresiaClase", CupoMembresiaClaseSchema);
