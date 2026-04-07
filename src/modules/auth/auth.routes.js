import { Router } from "express";
import {
  appleCallback,
  googleCallback,
  login,
  register,
  showLogin,
  showRegister,
  startAppleAuth,
  startGoogleAuth,
} from "./auth.controller.js";
import {
  showCompleteProfile,
  submitCompleteProfile,
  updateLanguagePreference,
} from "../profile/profile.controller.js";
import { isAuthenticated } from "../../middlewares/auth.middleware.js";
import { uploadProfilePhoto } from "../../middlewares/upload.middleware.js";

const router = Router();

router.get("/login", showLogin);

router.post("/login", login);

router.get("/register", showRegister);

router.post("/register", uploadProfilePhoto, register);

router.get("/auth/google", startGoogleAuth);
router.get("/auth/google/callback", googleCallback);
router.get("/auth/apple", startAppleAuth);
router.get("/auth/apple/callback", appleCallback);
router.post("/auth/apple/callback", appleCallback);

router.get("/complete-profile", isAuthenticated, showCompleteProfile);
router.post("/complete-profile", isAuthenticated, uploadProfilePhoto, submitCompleteProfile);
router.post("/preferences/language", isAuthenticated, updateLanguagePreference);

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("token");
    return res.redirect("/login");
  });
});

export default router;
