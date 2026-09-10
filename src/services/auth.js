import { env, usingSupabase } from "../config/env.js";
import { supabase, supabaseAuth } from "../lib/supabase.js";
import { loadActor } from "./profiles.js";

function sessionPayload(session, actor) {
  return {
    token: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ? session.expires_at * 1000 : Date.now() + (session.expires_in || 3600) * 1000,
    user: actor,
  };
}

export async function signInWithPassword(email, password) {
  if (!usingSupabase) {
    const err = new Error("Sign-in is not configured on this server.");
    err.status = 503;
    throw err;
  }
  const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
  if (error || !data?.session) {
    const err = new Error("Invalid email or password");
    err.status = 401;
    throw err;
  }
  const actor = await loadActor(data.user.id);
  if (!actor) {
    const err = new Error("This account is not set up in BRAINSTAK yet. Ask Head Office to invite you.");
    err.status = 403;
    throw err;
  }
  return sessionPayload(data.session, actor);
}

export async function refreshSession(refreshToken) {
  if (!usingSupabase) {
    const err = new Error("Sign-in is not configured on this server.");
    err.status = 503;
    throw err;
  }
  if (!refreshToken) {
    const err = new Error("Missing refresh token.");
    err.status = 400;
    throw err;
  }
  const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data?.session) {
    const err = new Error("Session expired — sign in again.");
    err.status = 401;
    throw err;
  }
  const actor = await loadActor(data.user.id);
  if (!actor) {
    const err = new Error("This account is no longer active.");
    err.status = 403;
    throw err;
  }
  return sessionPayload(data.session, actor);
}

/** Verifies a bearer access token and resolves it to an actor. Used by the
 * requireAuth middleware on every protected request. */
export async function actorFromAccessToken(accessToken) {
  if (!usingSupabase || !accessToken) return null;
  const { data, error } = await supabaseAuth.auth.getUser(accessToken);
  if (error || !data?.user) return null;
  return loadActor(data.user.id);
}

export function googleAuthorizeUrl() {
  if (!env.supabaseUrl) {
    const err = new Error("Supabase is not configured.");
    err.status = 503;
    throw err;
  }
  const redirectTo = `${env.clientOrigin}/login`;
  const url = new URL(`${env.supabaseUrl.replace(/\/$/, "")}/auth/v1/authorize`);
  url.searchParams.set("provider", "google");
  url.searchParams.set("redirect_to", redirectTo);
  return url.toString();
}

export async function sessionFromGoogleToken(accessToken) {
  if (!supabase) {
    const err = new Error("Supabase is not configured.");
    err.status = 503;
    throw err;
  }
  const { data, error } = await supabaseAuth.auth.getUser(accessToken);
  if (error || !data?.user) {
    const err = new Error(error?.message || "Google sign-in could not be verified.");
    err.status = 401;
    throw err;
  }
  const actor = await loadActor(data.user.id);
  if (!actor) {
    const err = new Error("This account is not set up in BRAINSTAK yet. Ask Head Office to invite you.");
    err.status = 403;
    throw err;
  }
  return { token: accessToken, user: actor };
}
