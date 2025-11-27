import dotenv from "dotenv";
dotenv.config(); // <-- Esto también es útil aquí

export const TOKEN_SECRET = process.env.TOKEN_SECRET;