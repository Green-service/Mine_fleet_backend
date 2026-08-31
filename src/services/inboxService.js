import * as catalog from "../data/catalog.js";
import { insertRow, readTable } from "./store.js";

function clockLabel(date = new Date()) {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function mapNotification(row) {
  return {
    id: row.id,
    title: row.title,
    detail: row.detail || "",
    kind: row.kind || "general",
    unread: row.unread !== false,
    time: row.time_label || row.timeLabel || "",
    createdAt: row.created_at || row.createdAt,
  };
}

function mapActivity(row) {
  return {
    id: row.id,
    actor: row.actor || "System",
    action: row.action,
    kind: row.kind || "general",
    time: row.time_label || row.timeLabel || "",
    createdAt: row.created_at || row.createdAt,
  };
}

export async function listNotifications() {
  const rows = await readTable("notifications", catalog.notifications);
  return rows.map(mapNotification).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function listActivity() {
  const rows = await readTable("activity_log", catalog.activity);
  return rows.map(mapActivity).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function recordNotification({ title, detail = "", kind = "general", unread = true }) {
  const now = new Date();
  const payload = {
    title,
    detail,
    kind,
    unread,
    time_label: clockLabel(now),
    created_at: now.toISOString(),
  };
  const saved = await insertRow("notifications", payload, catalog.notifications);
  return mapNotification(saved);
}

export async function recordActivity({ actor = "System", action, kind = "general" }) {
  const now = new Date();
  const payload = {
    actor,
    action,
    kind,
    time_label: clockLabel(now),
    created_at: now.toISOString(),
  };
  const saved = await insertRow("activity_log", payload, catalog.activity);
  return mapActivity(saved);
}

export async function listSites() {
  const rows = await readTable("sites", []);
  const names = rows.map((row) => row.name).filter(Boolean);
  if (names.length) return ["All Sites", ...names];
  return catalog.sites;
}
