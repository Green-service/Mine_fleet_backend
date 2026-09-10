import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { supabase } from "../lib/supabase.js";
import { initialsFrom } from "./profiles.js";
import { sendInviteEmail } from "./mail.js";

function dbError(error, fallback = "Database error") {
  const err = new Error(error?.message || fallback);
  err.status = 500;
  return err;
}

function notFound(what = "Record") {
  const err = new Error(`${what} not found`);
  err.status = 404;
  return err;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function tempPassword() {
  return `Mpg-${randomBytes(4).toString("hex")}`;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "role";
}

async function rolesTable() {
  const { data, error } = await supabase.from("roles").select("*").order("code", { ascending: true });
  if (error) throw dbError(error);
  return data || [];
}

function nextRoleCode(roles) {
  const used = roles
    .map((role) => Number(String(role.code || "").replace(/^R/i, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  return `R${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0")}`;
}

export async function listUsers() {
  const [{ data: profiles, error: perr }, { data: appUsers, error: uerr }, { data: invites, error: ierr }, roles] = await Promise.all([
    supabase.from("profiles").select("*"),
    supabase.from("app_users").select("*"),
    supabase.from("user_invites").select("*"),
    rolesTable(),
  ]);
  if (perr || uerr || ierr) throw dbError(perr || uerr || ierr);

  const appUserById = new Map((appUsers || []).map((u) => [u.id, u]));
  const inviteByEmail = new Map((invites || []).map((i) => [i.email, i]));
  const roleNameBySlug = new Map(roles.map((r) => [r.slug, r.name]));
  const demoEmail = env.demoEmail.toLowerCase();

  return (profiles || []).map((p) => {
    const au = appUserById.get(p.id);
    const invite = inviteByEmail.get(p.email);
    return {
      id: p.id,
      name: p.full_name,
      email: p.email,
      role: roleNameBySlug.get(p.role_slug) || p.role_slug,
      roleSlug: p.role_slug,
      site: invite?.site || "Grootegeluk",
      status: au?.is_active === false ? "Revoked" : invite?.status === "Invited" ? "Invited" : "Active",
      locked: p.email.toLowerCase() === demoEmail,
    };
  });
}

export async function listRoles() {
  const [roles, users] = await Promise.all([rolesTable(), listUsers()]);
  const active = users.filter((u) => u.status !== "Revoked");
  return roles.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    slug: row.slug,
    category: row.category,
    description: row.description,
    status: row.status,
    modules: row.modules,
    permissions: row.permissions || {},
    users: active.filter((u) => u.role === row.name || u.roleSlug === row.slug).length,
  }));
}

export async function createRole(body) {
  const roles = await rolesTable();
  const row = {
    code: body.code || nextRoleCode(roles),
    name: body.name,
    slug: body.slug || slugify(body.name),
    category: body.category || "Operations",
    description: body.description,
    modules: body.modules || 0,
    status: body.status || "Active",
    permissions: body.permissions || {},
  };
  const { data, error } = await supabase.from("roles").insert(row).select().single();
  if (error) throw dbError(error);
  return { ...data, users: 0 };
}

export async function updateRole(id, body) {
  const patch = {};
  for (const key of ["code", "name", "slug", "category", "description", "status", "permissions", "modules"]) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  const { data, error } = await supabase.from("roles").update(patch).eq("id", id).select().maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw notFound("Role");
  const roles = await listRoles();
  return roles.find((r) => r.id === id) || data;
}

export async function removeRole(id) {
  const { data: role, error } = await supabase.from("roles").select("*").eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  if (!role) throw notFound("Role");
  if (role.slug === "super-admin") {
    const users = await listUsers();
    const stillAssigned = users.some((u) => u.status !== "Revoked" && (u.role === role.name || u.roleSlug === role.slug));
    if (stillAssigned) throw badRequest(`${role.name} is still assigned to an active user — reassign or revoke them first.`);
  }
  const { error: delErr } = await supabase.from("roles").delete().eq("id", id);
  if (delErr) throw dbError(delErr);
  return { ok: true };
}

export async function updateUser(id, body) {
  const { data: profile, error: perr } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (perr) throw dbError(perr);
  if (!profile) throw notFound("User");
  if (profile.email.toLowerCase() === env.demoEmail.toLowerCase()) throw badRequest("Super Admin cannot be edited here.");

  const roles = await rolesTable();
  const matchedRole = roles.find((r) => r.name === body.role || r.slug === body.role);
  const patch = {};
  if (body.name) patch.full_name = String(body.name).trim();
  if (body.role) patch.role_slug = matchedRole?.slug || String(body.role).trim();
  if (Object.keys(patch).length) {
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) throw dbError(error);
  }
  if (patch.role_slug) {
    await supabase.from("app_users").update({ role_slug: patch.role_slug }).eq("id", id);
  }
  if (body.site) {
    await supabase.from("user_invites").update({ site: body.site }).eq("email", profile.email);
  }
  if (body.status) {
    await supabase.from("app_users").update({ is_active: body.status !== "Revoked" }).eq("id", id);
  }

  const users = await listUsers();
  return users.find((u) => u.id === id) || null;
}

export async function revokeUser(id) {
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  if (!profile) throw notFound("User");
  if (profile.email.toLowerCase() === env.demoEmail.toLowerCase()) throw badRequest("Super Admin cannot be removed.");

  await supabase.from("app_users").update({ is_active: false }).eq("id", id);
  await supabase.from("user_invites").update({ status: "Revoked" }).eq("email", profile.email);
  try {
    await supabase.auth.admin.updateUserById(id, { ban_duration: "876000h" });
  } catch {
    // best-effort — is_active=false already blocks the app via requireAuth
  }
  return { ok: true };
}

export async function inviteUser({ name, email, role, site }) {
  const fullName = String(name || "").trim();
  const workEmail = String(email || "").trim().toLowerCase();
  const roleName = String(role || "").trim();
  const homeSite = String(site || "Grootegeluk").trim();

  if (!fullName || !workEmail || !roleName) throw badRequest("Name, work email and role are required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail)) throw badRequest("Enter a valid work email.");
  if (workEmail === env.demoEmail.toLowerCase()) throw badRequest("That mailbox already holds Super Admin.");

  const { data: existing, error: existErr } = await supabase.from("profiles").select("id").eq("email", workEmail).maybeSingle();
  if (existErr) throw dbError(existErr);
  if (existing) {
    const err = new Error("That email already has an account.");
    err.status = 409;
    throw err;
  }

  const roles = await rolesTable();
  const matchedRole = roles.find((r) => r.name === roleName || r.slug === roleName);
  const roleSlug = matchedRole?.slug || slugify(roleName);
  const password = tempPassword();

  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: workEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (authErr || !authData?.user) {
    const err = new Error(authErr?.message || "Could not create the login account.");
    err.status = 502;
    throw err;
  }
  const userId = authData.user.id;

  async function rollback() {
    await supabase.auth.admin.deleteUser(userId).catch(() => {});
    await supabase.from("profiles").delete().eq("id", userId).catch(() => {});
    await supabase.from("app_users").delete().eq("id", userId).catch(() => {});
    await supabase.from("user_invites").delete().eq("email", workEmail).catch(() => {});
  }

  const { error: profErr } = await supabase.from("profiles").insert({
    id: userId,
    full_name: fullName,
    email: workEmail,
    role_slug: roleSlug,
    initials: initialsFrom(fullName, workEmail),
  });
  if (profErr) {
    await rollback();
    throw dbError(profErr, "Could not create the profile.");
  }

  const { error: userErr } = await supabase.from("app_users").insert({
    id: userId,
    profile_id: userId,
    email: workEmail,
    password_hash: "managed-by-supabase-auth",
    role_slug: roleSlug,
    is_active: true,
  });
  if (userErr) {
    await rollback();
    throw dbError(userErr, "Could not create the account record.");
  }

  const { error: inviteErr } = await supabase.from("user_invites").insert({
    full_name: fullName,
    email: workEmail,
    role_name: matchedRole?.name || roleName,
    role_slug: roleSlug,
    site: homeSite,
    status: "Invited",
  });
  if (inviteErr) {
    await rollback();
    throw dbError(inviteErr, "Could not record the invite.");
  }

  try {
    await sendInviteEmail({
      name: fullName,
      email: workEmail,
      role: matchedRole?.name || roleName,
      site: homeSite,
      password,
      loginUrl: `${env.clientOrigin}/login`,
    });
  } catch (err) {
    await rollback();
    throw err;
  }

  const users = await listUsers();
  return users.find((u) => u.id === userId);
}
