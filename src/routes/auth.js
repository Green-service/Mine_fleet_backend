import { Router } from "express";
import { demoLogin, googleAuthorizeUrl, sessionFromGoogleToken } from "../services/auth.js";

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const session = demoLogin(email, password);
  if (session) return res.json(session);
  res.status(401).json({ error: "Invalid email or password" });
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
