import mongoose from "mongoose";

const { Schema, model } = mongoose;

const AccessTokenSchema = new Schema(
  {
    usuario: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
    },

    reserva: {
      type: Schema.Types.ObjectId,
      ref: "Reserva",
      required: true,
    },

    empresa: {
      type: Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
    },

    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    tipo: {
      type: String,
      enum: ["reserva"],
      required: true,
    },

    expiraEn: {
      type: Date,
      required: true,
    },

    usado: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default model("AccessToken", AccessTokenSchema);
