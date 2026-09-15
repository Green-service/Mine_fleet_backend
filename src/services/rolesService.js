import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { supabase } from "../lib/supabase.js";
import { initialsFrom } from "./profiles.js";
import { sendInviteEmail } from "./mail.js";
import * as catalog from "../data/catalog.js";
import { deleteRow, insertRow, readTable, updateRow } from "./store.js";
import { numberValue } from "./validation.js";

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
  const rows = await readTable("roles", catalog.roles);
  return rows.sort((a, b) => String(a.code || "").localeCompare(String(b.code || "")));
}

function nextRoleCode(roles) {
  const used = roles
    .map((role) => Number(String(role.code || "").replace(/^R/i, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  return `R${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0")}`;
}

export async function listUsers() {
  const [profiles, appUsers, invites, roles] = await Promise.all([
    readTable("profiles", []),
    readTable("app_users", []),
    readTable("user_invites", catalog.invitedUsers),
    rolesTable(),
  ]);

  const appUserById = new Map((appUsers || []).flatMap((u) => [[u.id, u], ...(u.profile_id ? [[u.profile_id, u]] : [])]));
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
      locked: String(p.email || "").toLowerCase() === demoEmail,
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
  const name = String(body.name || "").trim();
  if (!name) throw badRequest("Role name is required.");
  const row = {
    code: body.code || nextRoleCode(roles),
    name,
    slug: body.slug || slugify(name),
    category: body.category || "Operations",
    description: body.description,
    modules: numberValue(body.modules, "Module count"),
    status: body.status || "Active",
    permissions: body.permissions || {},
  };
  if (!Number.isInteger(row.modules)) throw badRequest("Module count must be a whole number.");
  if (roles.some((role) => role.code === row.code || role.slug === row.slug)) throw Object.assign(new Error("That role code or reference already exists."), { status: 409 });
  const data = await insertRow("roles", row, catalog.roles);
  return { ...data, users: 0 };
}

export async function updateRole(id, body) {
  const patch = {};
  for (const key of ["code", "name", "slug", "category", "description", "status", "permissions", "modules"]) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  const existing = await rolesTable();
  if (!existing.some((row) => row.id === id)) throw notFound("Role");
  for (const key of ["name", "code", "slug"]) {
    if (key in patch) {
      patch[key] = String(patch[key] ?? "").trim();
      if (!patch[key]) throw badRequest(`Role ${key} is required.`);
    }
  }
  if (patch.modules !== undefined) {
    patch.modules = numberValue(patch.modules, "Module count");
    if (!Number.isInteger(patch.modules)) throw badRequest("Module count must be a whole number.");
  }
  if (existing.some((role) => role.id !== id && ((patch.code && role.code === patch.code) || (patch.slug && role.slug === patch.slug)))) throw Object.assign(new Error("That role code or reference already exists."), { status: 409 });
  const data = await updateRow("roles", id, patch, catalog.roles);
  const roles = await listRoles();
  return roles.find((r) => r.id === id) || data;
}

export async function removeRole(id) {
  const role = (await rolesTable()).find((row) => row.id === id);
  if (!role) throw notFound("Role");
  const users = await listUsers();
  if (users.some((user) => user.roleSlug === role.slug)) throw badRequest(`${role.name} is still assigned to a user. Reassign their role first.`);
  await deleteRow("roles", id, catalog.roles);
  return { ok: true };
}

async function updateLocalUser(id, body) {
  const [profiles, appUsers, invites, roles] = await Promise.all([
    readTable("profiles", []), readTable("app_users", []), readTable("user_invites", catalog.invitedUsers), rolesTable(),
  ]);
  const profile = profiles.find((row) => row.id === id);
  if (!profile) throw notFound("User");
  if (String(profile.email || "").toLowerCase() === env.demoEmail.toLowerCase()) throw badRequest("Super Admin cannot be edited here.");
  const patch = {};
  if (body.name !== undefined) {
    patch.full_name = String(body.name || "").trim();
    if (!patch.full_name) throw badRequest("User name is required.");
  }
  if (body.role !== undefined) {
    const role = roles.find((row) => row.name === body.role || row.slug === body.role);
    if (!role) throw badRequest("Choose an existing role.");
    patch.role_slug = role.slug;
  }
  if (body.status !== undefined && !["Active", "Invited", "Revoked"].includes(body.status)) throw badRequest("Choose a valid user status.");
  if (body.site !== undefined && !["Grootegeluk", "Belfast", "Medupi", "Head Office"].includes(body.site)) throw badRequest("Choose a valid site.");
  if (Object.keys(patch).length) await updateRow("profiles", id, patch, []);
  const appUser = appUsers.find((row) => row.id === id || row.profile_id === id);
  if (patch.role_slug || body.status !== undefined) {
    const userPatch = {
      ...(patch.role_slug ? { role_slug: patch.role_slug } : {}),
      ...(body.status !== undefined ? { is_active: body.status !== "Revoked" } : {}),
    };
    if (appUser) await updateRow("app_users", appUser.id, userPatch, []);
    else await insertRow("app_users", { id, profile_id: id, email: profile.email, role_slug: profile.role_slug, password_hash: "local-demo-no-login", is_active: true, ...userPatch }, []);
  }
  if (body.site !== undefined || body.status !== undefined) {
    const invite = invites.find((row) => row.email === profile.email);
    const invitePatch = {
      ...(body.site !== undefined ? { site: body.site } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    };
    if (invite) await updateRow("user_invites", invite.id, invitePatch, catalog.invitedUsers);
    else await insertRow("user_invites", {
      full_name: patch.full_name || profile.full_name, email: profile.email,
      role_slug: patch.role_slug || profile.role_slug,
      role_name: roles.find((row) => row.slug === (patch.role_slug || profile.role_slug))?.name || "",
      status: "Active", ...invitePatch,
    }, catalog.invitedUsers);
  }
  return (await listUsers()).find((user) => user.id === id);
}

export async function updateUser(id, body) {
  if (!supabase) return updateLocalUser(id, body);
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
  if (!supabase) {
    await updateLocalUser(id, { status: "Revoked" });
    return { ok: true };
  }
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
  if (!supabase) throw Object.assign(new Error("Invitations require configured Supabase authentication and email delivery. No invitation was sent."), { status: 503 });
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
