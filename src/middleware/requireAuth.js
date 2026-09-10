import { usingSupabase } from "../config/env.js";
import { actorFromAccessToken } from "../services/auth.js";

/** Verifies the bearer token on every request that reaches it and attaches
 * the resolved user as req.actor. Rejects the request outright if there's no
 * valid, active session — this is the server's actual access-control gate,
 * not just attribution for notifications. */
export async function requireAuth(req, res, next) {
  if (!usingSupabase) {
    // No Supabase configured (local dev without a project) — nothing to
    // verify against, so let requests through unauthenticated.
    req.actor = null;
    next();
    return;
  }

  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }

  const actor = await actorFromAccessToken(token);
  if (!actor) {
    res.status(401).json({ error: "Session expired — sign in again." });
    return;
  }

  req.actor = actor;
  next();
}
