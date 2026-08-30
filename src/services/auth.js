import { env } from "../config/env.js";
import { supabase } from "../lib/supabase.js";
import { sessionUser } from "../data/catalog.js";
import { findInvitedUser, sessionFromInvite } from "./inviteService.js";

function initialsFrom(name, email) {
  const parts = String(name || email || "?")
    .replace(/@.*$/, "")
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function demoLogin(email, password) {
  if (email === env.demoEmail.toLowerCase() && password === env.demoPassword) {
    return { token: "demo-session", user: sessionUser };
  }
  return sessionFromInvite(email, password);
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
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user) {
    const err = new Error(error?.message || "Google sign-in could not be verified.");
    err.status = 401;
    throw err;
  }
  const profile = data.user;
  const name = profile.user_metadata?.full_name || profile.user_metadata?.name || profile.email || "Google user";
  const email = (profile.email || "").toLowerCase();
  const isAdmin = email === env.demoEmail.toLowerCase();
  const invited = findInvitedUser(email);
  return {
    token: accessToken,
    user: {
      id: profile.id,
      name: isAdmin ? "Clinton Bongani Khoza" : invited?.name || name,
      email: profile.email || "",
      role: isAdmin ? "Super Admin" : invited?.role || "Operator",
      initials: isAdmin ? "CK" : invited?.initials || initialsFrom(name, profile.email),
    },
  };
}
