import * as catalog from "../data/catalog.js";
import { deleteRow, insertRow, readTable, updateRow } from "./store.js";
import { recordSystemEvent } from "./notifications.js";

const STATUSES = ["Active", "Setup", "Paused"];
const TYPES = [
  "Ride-hailing",
  "Mobility",
  "Software development",
  "Property",
  "Retail",
  "Services",
  "Other",
];

function num(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function money(value) {
  const n = num(value);
  return `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function marginPct(revenue, expenses) {
  if (!revenue) return 0;
  return Number((((revenue - expenses) / revenue) * 100).toFixed(1));
}

function slugifyName(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function businessIdFromName(name, existingIds = new Set()) {
  const base = slugifyName(name) || "venture";
  let id = `biz_${base}`;
  let n = 2;
  while (existingIds.has(id)) {
    id = `biz_${base}_${n}`;
    n += 1;
  }
  return id;
}

export function syncBusinessCatalog(rows) {
  catalog.businesses.splice(0, catalog.businesses.length, ...rows);
  catalog.businessNames.splice(0, catalog.businessNames.length, ...rows.map((row) => row.name));
}

export function mapBusiness(row) {
  const revenue = num(row.revenue_mtd ?? row.revenueMtd);
  const expenses = num(row.expenses_mtd ?? row.expensesMtd);
  const net = revenue - expenses;
  const margin = marginPct(revenue, expenses);
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status || "Active",
    primary: Boolean(row.is_primary ?? row.primary),
    revenueMtd: revenue,
    expensesMtd: expenses,
    netMtd: net,
    marginPct: margin,
    cashBalance: num(row.cash_balance ?? row.cashBalance),
    note: row.note || "",
    revenueLabel: money(revenue),
    expensesLabel: money(expenses),
    netLabel: money(net),
    marginLabel: `${margin.toFixed(1)}%`,
    cashLabel: money(num(row.cash_balance ?? row.cashBalance)),
  };
}

export async function readBusinessRows() {
  return readTable("businesses", catalog.businesses);
}

export async function listBusinesses() {
  const rows = await readBusinessRows();
  return rows
    .map(mapBusiness)
    .sort((a, b) => {
      if (a.primary !== b.primary) return a.primary ? -1 : 1;
      return b.netMtd - a.netMtd;
    });
}

function persistBusiness(input, previous = {}) {
  const name = String(input.name ?? previous.name ?? "").trim();
  if (!name) {
    const err = new Error("Business name is required.");
    err.status = 400;
    throw err;
  }
  const type = TYPES.includes(input.type || previous.type) ? (input.type || previous.type) : "Services";
  const status = STATUSES.includes(input.status || previous.status) ? (input.status || previous.status) : "Active";

  const isPrimary = Boolean(
    input.primary ?? input.is_primary ?? previous.is_primary ?? previous.primary ?? false,
  );

  return {
    name,
    type,
    status,
    is_primary: isPrimary,
    revenue_mtd: num(input.revenueMtd ?? input.revenue_mtd ?? previous.revenue_mtd ?? previous.revenueMtd),
    expenses_mtd: num(input.expensesMtd ?? input.expenses_mtd ?? previous.expenses_mtd ?? previous.expensesMtd),
    cash_balance: num(input.cashBalance ?? input.cash_balance ?? previous.cash_balance ?? previous.cashBalance),
    note: String(input.note ?? previous.note ?? "").trim(),
  };
}

export async function createBusiness(body, actor = null) {
  const rows = await readBusinessRows();
  const name = String(body.name || "").trim();
  if (!name) {
    const err = new Error("Business name is required.");
    err.status = 400;
    throw err;
  }
  if (rows.some((row) => String(row.name).toLowerCase() === name.toLowerCase())) {
    const err = new Error("A business with this name already exists.");
    err.status = 400;
    throw err;
  }

  const id = businessIdFromName(name, new Set(rows.map((row) => row.id)));
  const payload = persistBusiness({ ...body, name, primary: false });
  const saved = await insertRow("businesses", { id, ...payload }, catalog.businesses);
  syncBusinessCatalog(await readBusinessRows());
  const mapped = mapBusiness({ id, ...payload, ...saved });
  await recordSystemEvent({
    title: "Business added",
    detail: mapped.name,
    kind: "production",
    actor,
    action: "added a business",
    ctaPath: "/businesses",
  });
  return mapped;
}

export async function updateBusiness(id, body, actor = null) {
  const rows = await readBusinessRows();
  const previous = rows.find((row) => row.id === id);
  if (!previous) {
    const err = new Error("Business not found");
    err.status = 404;
    throw err;
  }
  const nextName = String(body.name ?? previous.name).trim();
  if (rows.some((row) => row.id !== id && String(row.name).toLowerCase() === nextName.toLowerCase())) {
    const err = new Error("A business with this name already exists.");
    err.status = 400;
    throw err;
  }
  const payload = persistBusiness(body, previous);
  if (previous.is_primary ?? previous.primary) {
    payload.is_primary = true;
  }
  const saved = await updateRow("businesses", id, payload, catalog.businesses);
  syncBusinessCatalog(await readBusinessRows());
  const mapped = mapBusiness({ ...previous, ...payload, ...saved, id });
  await recordSystemEvent({
    title: "Business updated",
    detail: mapped.name,
    kind: "production",
    actor,
    action: "updated a business",
    ctaPath: "/businesses",
  });
  return mapped;
}

export async function removeBusiness(id, actor = null) {
  const rows = await readBusinessRows();
  const previous = rows.find((row) => row.id === id);
  if (!previous) {
    const err = new Error("Business not found");
    err.status = 404;
    throw err;
  }
  if (previous.is_primary ?? previous.primary) {
    const err = new Error("Primary businesses cannot be removed.");
    err.status = 400;
    throw err;
  }
  await deleteRow("businesses", id, catalog.businesses);
  syncBusinessCatalog(await readBusinessRows());
  await recordSystemEvent({
    title: "Business removed",
    detail: previous.name,
    kind: "production",
    actor,
    action: "removed a business",
    ctaPath: "/businesses",
  });
  return { ok: true };
}

export function businessMeta() {
  return { types: TYPES, statuses: STATUSES };
}
