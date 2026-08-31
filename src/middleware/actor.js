import { env } from "../config/env.js";
import { sessionUser } from "../data/catalog.js";
import { listHubUsers } from "../services/inviteService.js";

export function resolveActor(req) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  if (token === "demo-session") return sessionUser;
  if (token.startsWith("invite-")) {
    const id = token.slice(7);
    const row = listHubUsers().find((user) => user.id === id);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      initials: row.initials || row.name?.slice(0, 2)?.toUpperCase() || "?",
    };
  }
  if (token.length > 40) {
    return {
      id: "google-user",
      name: env.demoEmail === sessionUser.email ? sessionUser.name : "Google user",
      email: env.demoEmail,
      role: "Super Admin",
      initials: "GU",
    };
  }
  return null;
}
