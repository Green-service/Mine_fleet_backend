import { Router } from "express";
import { googleAuthorizeUrl, refreshSession, sessionFromGoogleToken, signInWithPassword } from "../services/auth.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required." });
      return;
    }
    res.json(await signInWithPassword(email, password));
  } catch (err) {
    next(err);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    res.json(await refreshSession(req.body?.refreshToken));
  } catch (err) {
    next(err);
  }
});

authRouter.get("/google", (_req, res, next) => {
  try {
    res.redirect(googleAuthorizeUrl());
  } catch (err) {
    next(err);
  }
});

authRouter.post("/google/complete", async (req, res, next) => {
  try {
    const accessToken = String(req.body?.access_token || "");
    if (!accessToken) {
      res.status(400).json({ error: "Missing Google session." });
      return;
    }
    res.json(await sessionFromGoogleToken(accessToken));
  } catch (err) {
    next(err);
  }
});
