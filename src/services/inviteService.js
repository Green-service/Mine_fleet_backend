import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import * as catalog from "../data/catalog.js";
import { sendInviteEmail } from "./mail.js";

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

function tempPassword() {
  return `Mpg-${randomBytes(4).toString("hex")}`;
}

export function publicInvite(row) {
  if (!row) return null;
  const { password, ...rest } = row;
  return rest;
}

export function listHubUsers() {
  const admin = {
    id: catalog.sessionUser.id,
    name: catalog.sessionUser.name,
    email: catalog.sessionUser.email,
    role: catalog.sessionUser.role,
    site: "Head Office",
    status: "Active",
    locked: true,
  };
  const invited = catalog.invitedUsers.map((row) => ({
    ...publicInvite(row),
    locked: false,
  }));
  return [admin, ...invited];
}

export function refreshRoleUserCounts() {
  const live = listHubUsers().filter((row) => row.status !== "Revoked");
  for (const role of catalog.roles) {
    role.users = live.filter((row) => row.role === role.name).length;
  }
}

export function updateHubUser(id, body) {
  if (id === catalog.sessionUser.id) {
    const err = new Error("Super Admin cannot be edited here.");
    err.status = 400;
    throw err;
  }
  const row = catalog.invitedUsers.find((item) => item.id === id);
  if (!row) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }
  const nextRole = String(body.role || row.role).trim();
  const matchedRole = catalog.roles.find((item) => item.name === nextRole || item.slug === nextRole);
  row.name = String(body.name || row.name).trim();
  row.role = matchedRole?.name || nextRole;
  row.roleSlug = matchedRole?.slug || row.roleSlug;
  row.site = String(body.site || row.site || "Head Office").trim();
  if (body.status) row.status = body.status;
  refreshRoleUserCounts();
  return publicInvite(row);
}

export function revokeHubUser(id) {
  if (id === catalog.sessionUser.id) {
    const err = new Error("Super Admin cannot be removed.");
    err.status = 400;
    throw err;
  }
  const row = catalog.invitedUsers.find((item) => item.id === id);
  if (!row) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }
  row.status = "Revoked";
  refreshRoleUserCounts();
  return { ok: true };
}

export function findInvitedUser(email) {
  const key = String(email || "").trim().toLowerCase();
  return catalog.invitedUsers.find((row) => row.email === key) || null;
}

export function sessionFromInvite(email, password) {
  const row = findInvitedUser(email);
  if (!row || row.password !== password || row.status === "Revoked") return null;
  return {
    token: `invite-${row.id}`,
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      initials: row.initials,
    },
  };
}

export async function inviteUser({ name, email, role, site }) {
  const fullName = String(name || "").trim();
  const workEmail = String(email || "").trim().toLowerCase();
  const roleName = String(role || "").trim();
  const homeSite = String(site || "Head Office").trim();

  if (!fullName || !workEmail || !roleName) {
    const err = new Error("Name, work email and role are required.");
    err.status = 400;
    throw err;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail)) {
    const err = new Error("Enter a valid work email.");
    err.status = 400;
    throw err;
  }
  if (workEmail === env.demoEmail.toLowerCase()) {
    const err = new Error("That mailbox already holds Super Admin.");
    err.status = 400;
    throw err;
  }
  if (findInvitedUser(workEmail)) {
    const err = new Error("That email already has an invite.");
    err.status = 409;
    throw err;
  }

  const matchedRole = catalog.roles.find((item) => item.name === roleName || item.slug === roleName);
  const password = tempPassword();
  const row = {
    id: crypto.randomUUID(),
    name: fullName,
    email: workEmail,
    role: matchedRole?.name || roleName,
    roleSlug: matchedRole?.slug || "",
    site: homeSite,
    status: "Invited",
    initials: initialsFrom(fullName, workEmail),
    password,
    invitedAt: new Date().toISOString(),
  };

  catalog.invitedUsers.unshift(row);
  refreshRoleUserCounts();

  try {
    await sendInviteEmail({
      name: row.name,
      email: row.email,
      role: row.role,
      site: row.site,
      password,
      loginUrl: `${env.clientOrigin}/login`,
    });
  } catch (err) {
    catalog.invitedUsers = catalog.invitedUsers.filter((item) => item.id !== row.id);
    refreshRoleUserCounts();
    throw err;
  }

  return publicInvite(row);
}
