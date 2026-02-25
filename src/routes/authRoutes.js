import { Router } from "express";
import {
  forgotPassword,
  login,
  logout,
  me,
  register,
  resetPassword,
  updateUsuarioPassword,
  verifyClaim,
} from "../controllers/authController.js";
import { validarToken } from "../middlewares/validarToken.js";

const router = Router();

router.post("/:slug/login", login);
router.post("/logout", logout);
router.post("/:slug/register", register);
router.post("/:slug/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword)
router.post("/change-password/:id", validarToken, updateUsuarioPassword);
router.get("/me", validarToken, me);
router.get("/verify-claim", verifyClaim);

export default router;
