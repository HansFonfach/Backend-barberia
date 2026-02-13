import { Router } from "express";
import {
  forgotPassword,
  login,
  logout,
  me,
  register,
  updateUsuarioPassword,
} from "../controllers/authController.js";
import { validarToken } from "../middlewares/validarToken.js";

const router = Router();

router.post("/:slug/login", login);
router.post("/logout", logout);
router.post("/:slug/register", register);
router.post("/forgot-password", forgotPassword);
router.post("/change-password/:id", validarToken, updateUsuarioPassword);
router.get("/me", validarToken, me);

router.get("/verify", validarToken, (req, res) => {
  res.json({ usuario: req.usuario });
});

export default router;
