import mongoose from "mongoose";

const { Schema } = mongoose;

// Marca "sí tomé este suplemento tal día" — solo existe el documento
// cuando SÍ se tomó (no se guardan filas en false); "no tomado" es
// simplemente que no existe el documento para esa fecha. fecha va como
// texto "YYYY-MM-DD" (no Date) a propósito: evita líos de huso horario al
// comparar "es hoy" — se arma con dayjs().tz("America/Santiago") en el
// controller, igual que el resto del módulo.
const TomaSuplementoSchema = new Schema(
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
    suplemento: {
      type: Schema.Types.ObjectId,
      ref: "SuplementoUsuario",
      required: true,
      index: true,
    },

    fecha: { type: String, required: true }, // "YYYY-MM-DD"
  },
  { timestamps: true },
);

TomaSuplementoSchema.index({ suplemento: 1, fecha: 1 }, { unique: true });

export default mongoose.model("TomaSuplemento", TomaSuplementoSchema);
