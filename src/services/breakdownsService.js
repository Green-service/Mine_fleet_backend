import * as catalog from "../data/catalog.js";
import * as ref from "../data/referenceCatalog.js";
import { recordSystemEvent } from "./notifications.js";
import { deleteRow, insertRow, readTable, updateRow } from "./store.js";
import { makeCollection, num as cnum, optStr, str } from "./collectionService.js";

const SEVERITY_RANK = { Critical: 0, Major: 1, Moderate: 2, Minor: 3 };

function downtimeHours(value) {
  const text = String(value || "").toLowerCase();
  if (!text || text.includes("just")) return 0;
  const amount = Number(text.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(amount)) return 0;
  if (text.includes("day")) return amount * 24;
  if (text.includes("week")) return amount * 24 * 7;
  return amount;
}

function toItem(row) {
  return {
    id: row.id,
    machine: String(row.machine || "").trim().toUpperCase(),
    failure: row.failure || "",
    downtime: row.downtime || "Just reported",
    severity: row.severity || "Moderate",
    parts: row.parts || "TBC",
    status: row.status || "Investigation",
    site: row.site || "Grootegeluk",
  };
}

function persistItem(input, previous = {}) {
  const machine = String(input.machine || previous.machine || "").trim().toUpperCase();
  const failure = String(input.failure || previous.failure || "").trim();
  if (!machine) {
    const err = new Error("Fleet number is required.");
    err.status = 400;
    throw err;
  }
  if (!failure) {
    const err = new Error("Describe the failure.");
    err.status = 400;
    throw err;
  }
  return {
    machine,
    failure,
    downtime: String(input.downtime || previous.downtime || "Just reported").trim() || "Just reported",
    severity: String(input.severity || previous.severity || "Moderate").trim(),
    parts: String(input.parts || previous.parts || "TBC").trim() || "TBC",
    status: String(input.status || previous.status || "Investigation").trim(),
    site: String(input.site || previous.site || "Grootegeluk").trim(),
  };
}

async function readItems() {
  const rows = await readTable("breakdowns", catalog.breakdowns);
  return rows
    .map(toItem)
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));
}

function longestDowntime(items) {
  if (!items.length) return { value: "—", hint: "No open failures" };
  const top = [...items].sort((a, b) => downtimeHours(b.downtime) - downtimeHours(a.downtime))[0];
  return { value: top.downtime, hint: `${top.machine} ${top.failure}`.trim() };
}

export async function getBreakdowns() {
  const items = await readItems();
  const longest = longestDowntime(items);
  return {
    items,
    kpis: {
      open: items.length,
      critical: items.filter((row) => row.severity === "Critical").length,
      longest: longest.value,
      longestHint: longest.hint,
      inventory: 0,
    },
  };
}

export async function reportBreakdown(body, actor = null) {
  const payload = persistItem(body);
  const saved = await insertRow("breakdowns", payload, catalog.breakdowns);
  const row = toItem({ ...payload, ...saved });
  if (!saved.machine) Object.assign(saved, row);
  await recordSystemEvent({
    title: "Breakdown reported",
    detail: `${row.machine} · ${row.failure}`,
    kind: "maintenance",
    actor,
    action: "reported a breakdown",
    ctaPath: "/breakdowns",
  });
  return row;
}

export async function updateBreakdown(id, body, actor = null) {
  const previous = (await readItems()).find((row) => row.id === id);
  if (!previous) {
    const err = new Error("Breakdown not found");
    err.status = 404;
    throw err;
  }
  const payload = persistItem(body, previous);
  const saved = await updateRow("breakdowns", id, payload, catalog.breakdowns);
  const row = toItem({ ...previous, ...payload, ...saved, id });
  Object.assign(saved, row);
  await recordSystemEvent({
    title: "Breakdown updated",
    detail: `${row.machine} · ${row.status}`,
    kind: "maintenance",
    actor,
    action: "updated a breakdown",
    ctaPath: "/breakdowns",
  });
  return row;
}

export async function removeBreakdown(id, actor = null) {
  const previous = (await readItems()).find((row) => row.id === id);
  await deleteRow("breakdowns", id, catalog.breakdowns);
  if (previous) {
    await recordSystemEvent({
      title: "Breakdown removed",
      detail: `${previous.machine} · ${previous.failure}`,
      kind: "maintenance",
      actor,
      action: "removed a breakdown",
      ctaPath: "/breakdowns",
    });
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Static/historical registers migrated off local component state
// ---------------------------------------------------------------------------

function inventoryRow(row) {
  return { id: row.id, site: row.site, category: row.category, part: row.part, desc: row.description, qty: row.qty, equipment: row.equipment, status: row.status };
}
function inventoryPayload(input, previous = {}) {
  const site = str(input.site, previous.site);
  const desc = str(input.desc, previous.desc);
  if (!site) {
    const err = new Error("Enter a site or location.");
    err.status = 400;
    throw err;
  }
  if (!desc) {
    const err = new Error("Enter a part description.");
    err.status = 400;
    throw err;
  }
  return {
    site,
    category: optStr(input.category, previous.category),
    part: optStr(input.part, previous.part),
    description: desc,
    qty: optStr(input.qty, previous.qty),
    equipment: optStr(input.equipment, previous.equipment),
    status: optStr(input.status, previous.status) || "In Stock",
  };
}
export const inventory = makeCollection("breakdowns_inventory", ref.breakdownsInventory, { toRow: inventoryRow, toPayload: inventoryPayload });

export async function listCriticalSpares() {
  const rows = await inventory.list();
  return rows
    .filter((row) => row.status === "Required" || row.status === "Low Stock")
    .map((row) => ({
      site: row.site,
      item: row.desc,
      equipment: row.equipment,
      status: row.status,
      action: row.status === "Required" ? "Create procurement request" : "Monitor stock level",
    }));
}

function availabilityRow(row) {
  return { id: row.id, plant: row.plant, type: row.type, hoursWorked: row.hours_worked, breakdownHours: row.breakdown_hours, failures: row.failures, availability: row.availability, status: row.status };
}
export const availability = makeCollection("breakdowns_availability", ref.breakdownsAvailability, { toRow: availabilityRow });
