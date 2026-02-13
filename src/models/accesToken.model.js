import mongoose from "mongoose";

const { Schema } = mongoose;

const AccessTokenSchema = new Schema({
  usuario: {
    type: Schema.Types.ObjectId,
    ref: "Usuario",
    required: true,
  },
  token: {
    type: String,
    required: true,
    unique: true,
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
});

export default model("AccessToken", AccessTokenSchema);
