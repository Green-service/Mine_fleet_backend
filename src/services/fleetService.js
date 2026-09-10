import * as catalog from "../data/catalog.js";
import * as ref from "../data/referenceCatalog.js";
import { recordSystemEvent } from "./notifications.js";
import { deleteRow, insertRow, readTable, updateRow } from "./store.js";
import { makeCollection } from "./collectionService.js";

const SITES = ["Grootegeluk", "Belfast", "Medupi"];
const STATUSES = ["Operational", "Monitor", "Breakdown", "Maintenance", "Standby"];

function num(value) {
  const n = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function toUnit(row) {
  return {
    id: row.id,
    fleetNo: row.fleet_no || row.fleetNo,
    equipment: row.equipment,
    category: row.category || "Unclassified",
    site: row.site || "Grootegeluk",
    hours: num(row.hours),
    health: Math.min(100, Math.max(0, num(row.health))),
    status: STATUSES.includes(row.status) ? row.status : "Operational",
  };
}

function buildClasses(units) {
  const groups = new Map();
  for (const unit of units) {
    const key = unit.category || "Unclassified";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(unit);
  }
  return [...groups.entries()].map(([category, items]) => ({
    category,
    quantity: items.length,
    make: [...new Set(items.map((item) => item.equipment).filter(Boolean))].join(", ") || "—",
    area: [...new Set(items.map((item) => item.site).filter(Boolean))].join(", ") || "—",
    units: items.map((item) => item.fleetNo).filter(Boolean).join(", ") || "—",
  }));
}

function persistPayload(input, previous = {}) {
  const fleetNo = String(input.fleetNo || input.fleet_no || previous.fleetNo || "").trim().toUpperCase();
  const name = String(input.equipment || previous.equipment || "").trim();
  if (!fleetNo) {
    const err = new Error("Fleet number is required.");
    err.status = 400;
    throw err;
  }
  if (!name) {
    const err = new Error("Machine make / model is required.");
    err.status = 400;
    throw err;
  }
  const site = String(input.site || previous.site || "Grootegeluk").trim();
  if (SITES.length && site && !SITES.includes(site)) {
    const err = new Error("Choose a valid site.");
    err.status = 400;
    throw err;
  }
  return {
    fleet_no: fleetNo,
    equipment: name,
    category: String(input.category || previous.category || "Front-End Loader").trim(),
    site: SITES.includes(site) ? site : "Grootegeluk",
    hours: num(input.hours ?? previous.hours),
    health: Math.min(100, Math.max(0, num(input.health ?? previous.health ?? 100))),
    status: STATUSES.includes(input.status) ? input.status : previous.status || "Operational",
  };
}

async function readUnits() {
  const rows = await readTable("equipment", catalog.equipment);
  return rows.map(toUnit).sort((a, b) => String(a.fleetNo).localeCompare(String(b.fleetNo)));
}

export async function getFleet() {
  const equipment = await readUnits();
  return {
    equipment,
    categories: buildClasses(equipment),
  };
}

export async function addUnit(body, actor = null) {
  const payload = persistPayload(body);
  const existing = (await readUnits()).find((row) => row.fleetNo === payload.fleet_no);
  if (existing) {
    const err = new Error("That fleet number is already on the register.");
    err.status = 409;
    throw err;
  }
  const saved = await insertRow("equipment", payload, catalog.equipment);
  const row = toUnit({ ...payload, fleetNo: payload.fleet_no, ...saved });
  if (!saved.fleetNo) Object.assign(saved, row);
  await recordSystemEvent({
    title: "Fleet unit added",
    detail: `${row.fleetNo} · ${row.equipment}`,
    kind: "maintenance",
    actor,
    action: "added a fleet unit",
    ctaPath: "/fleet",
  });
  return row;
}

export async function updateUnit(id, body, actor = null) {
  const previous = (await readUnits()).find((row) => row.id === id);
  if (!previous) {
    const err = new Error("Unit not found");
    err.status = 404;
    throw err;
  }
  const payload = persistPayload(body, previous);
  const clash = (await readUnits()).find((row) => row.fleetNo === payload.fleet_no && row.id !== id);
  if (clash) {
    const err = new Error("That fleet number is already on the register.");
    err.status = 409;
    throw err;
  }
  const saved = await updateRow("equipment", id, payload, catalog.equipment);
  const row = toUnit({ ...previous, ...payload, fleetNo: payload.fleet_no, ...saved, id });
  Object.assign(saved, row);
  await recordSystemEvent({
    title: "Fleet unit updated",
    detail: `${row.fleetNo} · ${row.equipment}`,
    kind: "maintenance",
    actor,
    action: "updated a fleet unit",
    ctaPath: "/fleet",
  });
  return row;
}

export async function removeUnit(id, actor = null) {
  const previous = (await readUnits()).find((row) => row.id === id);
  await deleteRow("equipment", id, catalog.equipment);
  if (previous) {
    await recordSystemEvent({
      title: "Fleet unit removed",
      detail: `${previous.fleetNo} · ${previous.equipment}`,
      kind: "maintenance",
      actor,
      action: "removed a fleet unit",
      ctaPath: "/fleet",
    });
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Static/historical registers migrated off local component state
// ---------------------------------------------------------------------------

function summaryRow(row) {
  return { id: row.id, type: row.type, qty: row.qty };
}
export const equipmentSummary = makeCollection("fleet_equipment_summary", ref.fleetEquipmentSummary, { toRow: summaryRow });

function plantRegisterRow(row) {
  return { id: row.id, category: row.category, units: row.units, make: row.make, area: row.area, qty: row.quantity };
}
export const plantRegister = makeCollection("fleet_classes", ref.fleetPlantRegister, { toRow: plantRegisterRow });
