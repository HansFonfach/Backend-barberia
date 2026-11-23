// Lista de espera de canchas: "avísame si se libera". Una entrada = una
// persona esperando una hora puntual. Cuando esa hora se libera (alguien
// cancela) se avisa a todos los que esperaban algo que ahora cabe, y el
// primero que reserva se la queda.
import mongoose from "mongoose";

const { Schema } = mongoose;

const listaEsperaCanchaSchema = new Schema(
  {
    empresa: { type: Schema.Types.ObjectId, ref: "Empresa", required: true },
    fecha: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    hora: { type: String, required: true, match: /^([01]\d|2[0-3]):00$/ },
    inicio: { type: Date, required: true },
    // Qué le sirve: la completa, media, o cualquiera de las dos
    tipo: { type: String, enum: ["completa", "media", "cualquiera"], default: "cualquiera" },
    cliente: {
      nombre: { type: String, required: true, trim: true, maxlength: 80 },
      telefono: { type: String, required: true, trim: true, maxlength: 20 },
      telefonoNormalizado: { type: String, required: true },
      email: { type: String, trim: true, lowercase: true, maxlength: 120, default: "" },
    },
    // esperando → avisado (se liberó y se le avisó) · vencida (pasó la hora)
    estado: { type: String, enum: ["esperando", "avisado", "vencida"], default: "esperando" },
    avisadoEn: { type: Date, default: null },
    error: { type: String, default: "" },
  },
  { timestamps: true },
);

listaEsperaCanchaSchema.index({ empresa: 1, fecha: 1, hora: 1, estado: 1 });
listaEsperaCanchaSchema.index(
  { empresa: 1, fecha: 1, hora: 1, "cliente.telefonoNormalizado": 1 },
  { unique: true, partialFilterExpression: { estado: "esperando" }, name: "espera_una_vez_por_hora" },
);
listaEsperaCanchaSchema.index({ estado: 1, inicio: 1 });

export default mongoose.model("ListaEsperaCancha", listaEsperaCanchaSchema, "listaesperacancha");
