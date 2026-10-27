import mongoose from "mongoose";

const { Schema } = mongoose;

export const ESTADOS_LISTA_ESPERA = ["esperando", "avisado", "vencido", "quitado"];

/**
 * Persona que quiso reservar un día sin lugar para su grupo y pidió que le
 * avisen si se libera. Se le avisa UNA vez por correo (el lugar es para quien
 * reserve primero); si no alcanza, puede volver a anotarse.
 */
const ListaEsperaMesaSchema = new Schema(
  {
    empresa: { type: Schema.Types.ObjectId, ref: "Empresa", required: true, index: true },
    fecha: { type: String, required: true }, // "YYYY-MM-DD"
    personas: { type: Number, required: true, min: 1 },
    nombre: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    estado: { type: String, enum: ESTADOS_LISTA_ESPERA, default: "esperando" },
    avisadoEn: { type: Date, default: null },
  },
  { timestamps: true },
);

ListaEsperaMesaSchema.index({ empresa: 1, fecha: 1, estado: 1 });
ListaEsperaMesaSchema.index({ estado: 1, fecha: 1 });
// Una inscripción vigente por correo y día
ListaEsperaMesaSchema.index(
  { empresa: 1, fecha: 1, email: 1 },
  { unique: true, partialFilterExpression: { estado: "esperando" } },
);

export default mongoose.model("ListaEsperaMesa", ListaEsperaMesaSchema, "listaEsperaMesa");
