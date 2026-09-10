import { supabase } from "../lib/supabase.js";

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

/** Look up the profile + app_user + role row for a real Supabase Auth user id.
 * Returns null if there's no matching profile (auth account exists but was
 * never provisioned into the app) or the account has been deactivated. */
export async function loadActor(userId) {
  const { data: profile, error: perr } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (perr || !profile) return null;

  const { data: appUser } = await supabase.from("app_users").select("*").eq("id", userId).maybeSingle();
  if (appUser && appUser.is_active === false) return null;

  const { data: role } = await supabase.from("roles").select("*").eq("slug", profile.role_slug).maybeSingle();

  return {
    id: profile.id,
    name: profile.full_name || profile.email,
    email: profile.email,
    role: role?.name || profile.role_slug || "Operator",
    roleSlug: profile.role_slug || "",
    initials: profile.initials || initialsFrom(profile.full_name, profile.email),
    permissions: role?.permissions || {},
  };
}

export { initialsFrom };
