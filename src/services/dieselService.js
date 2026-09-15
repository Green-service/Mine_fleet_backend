import * as catalog from "../data/catalog.js";
import * as ref from "../data/referenceCatalog.js";
import { recordSystemEvent } from "./notifications.js";
import { deleteRow, insertRow, readTable, updateRow } from "./store.js";
import { makeCollection, num as cnum, optStr, str } from "./collectionService.js";
import { machineConsumption, consumptionByType, dieselNumber, filterTransactions, operatorNames, reconciliationRow, transactionTotals } from "./dieselMetrics.js";
import { invalid, isoDate, numberValue } from "./validation.js";
import { getMachineHours } from "./machineHoursService.js";
import { storeFuelSlip } from "./fuelSlipService.js";
import { deleteAssetPhotos } from "./storageService.js";

const FUEL_TYPES = ["Petrol 95", "Petrol 93", "Diesel 50"];

function num(value) {
  const n = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDmy(value) {
  const date = parseDate(value) || new Date();
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatIso(value) {
  const date = parseDate(value) || new Date();
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function toFill(row, assetMap = {}, driverMap = {}) {
  const assetId = row.asset_id || row.assetId;
  const asset = assetMap[assetId];
  const workDate = row.work_date || row.workDate || row.date;
  const litres = num(row.litres);
  const odometerKm = num(row.odometer_km ?? row.odometerKm);
  const driver = row.operator || row.driver || driverMap[asset?.assigned_driver_id]?.name || "";

  return {
    id: row.id,
    assetId,
    assetCode: asset?.asset_code || asset?.assetCode || "—",
    makeModel: asset?.make_model || asset?.makeModel || "",
    vehicleLabel: asset ? `${asset.asset_code || asset.assetCode} · ${asset.make_model || asset.makeModel}` : "—",
    photos: Array.isArray(asset?.photos) ? asset.photos : [],
    site: row.site || asset?.site || asset?.business || "Grootegeluk",
    business: row.business || asset?.business || "Bolt rides",
    workDate: formatIso(workDate),
    date: formatDmy(workDate),
    station: row.station || row.site || "—",
    fuelType: row.fuel_type || row.fuelType || "Petrol 95",
    litres,
    litresLabel: `${litres.toLocaleString("en-ZA")} L`,
    odometerKm,
    odometerLabel: odometerKm ? `${odometerKm.toLocaleString("en-ZA")} km` : "—",
    driver,
    operator: driver,
    notes: row.notes || "",
    slipUrl: row.slip_url || "",
    slipName: row.slip_name || "",
  };
}

function fillEfficiency(fills) {
  const sorted = [...fills].sort((a, b) => String(a.workDate).localeCompare(String(b.workDate)));
  if (sorted.length < 2) return null;
  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  const km = num(latest.odometerKm) - num(previous.odometerKm);
  if (km <= 0) return null;
  return Number(((latest.litres / km) * 100).toFixed(1));
}

function enrichFillsWithEfficiency(fills) {
  const byAsset = new Map();
  for (const fill of fills) {
    const list = byAsset.get(fill.assetId) || [];
    list.push(fill);
    byAsset.set(fill.assetId, list);
  }
  return fills.map((fill) => {
    const assetFills = byAsset.get(fill.assetId) || [];
    const sorted = [...assetFills].sort((a, b) => String(a.workDate).localeCompare(String(b.workDate)));
    const index = sorted.findIndex((row) => row.id === fill.id);
    const segment = index > 0 ? fillEfficiency([sorted[index - 1], sorted[index]]) : null;
    return {
      ...fill,
      l100kmLabel: segment != null ? `${segment} L/100km` : "—",
    };
  });
}

function persistFill(input, previous = {}, assetRow = null) {
  const assetId = String(input.assetId || input.asset_id || previous.assetId || "").trim();
  if (!assetId) {
    const err = new Error("Select a vehicle for this fill.");
    err.status = 400;
    throw err;
  }
  const litres = numberValue(input.litres ?? previous.litres, "Litres");
  if (litres <= 0) {
    const err = new Error("Enter litres filled.");
    err.status = 400;
    throw err;
  }
  const odometerKm = numberValue(input.odometerKm ?? input.odometer_km ?? previous.odometerKm, "Odometer");
  if (odometerKm <= 0) {
    const err = new Error("Enter the odometer reading (km).");
    err.status = 400;
    throw err;
  }

  return {
    asset_id: assetId,
    business: assetRow?.business || input.business || previous.business || "Bolt rides",
    work_date: isoDate(input.date ?? input.work_date ?? input.workDate ?? previous.workDate ?? new Date()),
    fuel_type: FUEL_TYPES.includes(input.fuelType || input.fuel_type) ? (input.fuelType || input.fuel_type) : (previous.fuelType || "Petrol 95"),
    litres,
    odometer_km: odometerKm,
    operator: optStr(input.operator ?? input.driver, previous.operator ?? previous.driver),
  };
}

async function readAssets() {
  return readTable("assets", catalog.assets);
}

async function readDrivers() {
  return readTable("drivers", catalog.drivers);
}

async function readFillsRaw() {
  const rows = await readTable("diesel_issues", catalog.dieselIssues);
  const vehicleRows = rows.filter((row) => row.asset_id || row.assetId);
  return vehicleRows.length ? vehicleRows : catalog.dieselIssues;
}

export async function getDiesel(filters = {}) {
  const selected = dieselFilters(filters);
  const [assets, drivers, rawFills] = await Promise.all([
    readAssets(),
    readDrivers(),
    readFillsRaw(),
  ]);
  const assetMap = Object.fromEntries(assets.map((row) => [row.id, row]));
  const driverMap = Object.fromEntries(drivers.map((row) => [row.id, row]));
  const fills = enrichFillsWithEfficiency(
    rawFills
      .map((row) => toFill(row, assetMap, driverMap))
      .filter((row) => row.assetId)
      .sort((a, b) => String(b.workDate).localeCompare(String(a.workDate))),
  );
  const assetOptions = assets
    .filter((row) => (row.kind || "vehicle") !== "property")
    .map((row) => ({
    id: row.id,
    label: `${row.asset_code || row.assetCode} · ${row.make_model || row.makeModel}`,
    site: row.site || row.business || "Grootegeluk",
    fuelType: String(row.make_model || row.makeModel).toLowerCase().includes("ranger") ? "Diesel 50" : "Petrol 95",
  }));

  return {
    fills: filterTransactions(fills, selected),
    assets: assetOptions,
    fuelTypes: FUEL_TYPES,
    operators: operatorNames(fills, drivers),
  };
}

export async function captureIssue(body, actor = null) {
  const assets = await readAssets();
  const assetRow = assets.find((row) => row.id === (body.assetId || body.asset_id));
  if (!assetRow) {
    const err = new Error("Vehicle not found");
    err.status = 404;
    throw err;
  }
  const payload = persistFill(body, {}, assetRow);
  payload.id = crypto.randomUUID();
  Object.assign(payload, await storeFuelSlip(body.slip, payload.id));
  let saved;
  try {
    saved = await insertRow("diesel_issues", payload, catalog.dieselIssues);
  } catch (error) {
    if (payload.slip_url) await deleteAssetPhotos([payload.slip_url]).catch(() => {});
    throw error;
  }
  const assetMap = Object.fromEntries(assets.map((row) => [row.id, row]));
  const fill = toFill({ ...payload, ...saved }, assetMap);
  await recordSystemEvent({
    title: "Fuel fill logged",
    detail: `${fill.assetLabel || fill.machine} · ${fill.litres} L`,
    kind: "maintenance",
    actor,
    action: "logged a fuel fill",
    ctaPath: "/diesel",
  });
  return fill;
}

export async function updateIssue(id, body, actor = null) {
  const [rawFills, assets, drivers] = await Promise.all([readFillsRaw(), readAssets(), readDrivers()]);
  const previousRaw = rawFills.find((row) => row.id === id);
  if (!previousRaw) {
    const err = new Error("Fuel entry not found");
    err.status = 404;
    throw err;
  }
  const assetMap = Object.fromEntries(assets.map((row) => [row.id, row]));
  const driverMap = Object.fromEntries(drivers.map((row) => [row.id, row]));
  const previous = toFill(previousRaw, assetMap, driverMap);
  const assetRow = assets.find((row) => row.id === (body.assetId || body.asset_id || previous.assetId));
  const payload = persistFill(body, previous, assetRow);
  const saved = await updateRow("diesel_issues", id, payload, catalog.dieselIssues);
  const fill = toFill({ ...previousRaw, ...payload, ...saved, id }, assetMap, driverMap);
  await recordSystemEvent({
    title: "Fuel fill updated",
    detail: `${fill.assetLabel || fill.machine} · ${fill.litres} L`,
    kind: "maintenance",
    actor,
    action: "updated a fuel fill",
    ctaPath: "/diesel",
  });
  return fill;
}

export async function removeIssue(id, actor = null) {
  const rawFills = await readFillsRaw();
  const previous = rawFills.find((row) => row.id === id);
  await deleteRow("diesel_issues", id, catalog.dieselIssues);
  if (previous?.slip_url) await deleteAssetPhotos([previous.slip_url]).catch(() => {});
  if (previous) {
    await recordSystemEvent({
      title: "Fuel fill removed",
      detail: previous.machine || previous.station || "Fuel entry",
      kind: "maintenance",
      actor,
      action: "removed a fuel fill",
      ctaPath: "/diesel",
    });
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Static/historical registers migrated off local component state
// ---------------------------------------------------------------------------

export const byMachine = {
  async list(filters = {}) {
    const selected = dieselFilters(filters);
    const [rows, fleet, hours] = await Promise.all([
      transactions.list(), readTable("equipment", catalog.equipment), getMachineHours({ site: "All sites", from: selected.from, to: selected.to }),
    ]);
    return machineConsumption(filterTransactions(rows, selected), fleet, hours.entries, selected);
  },
};

function transactionRow(row) {
  return {
    id: row.id,
    date: row.work_date || row.date || "",
    time: row.work_time || row.time || "",
    site: row.site || "Grootegeluk",
    machine: row.machine || "",
    operator: row.operator || "",
    opening: dieselNumber(row.opening),
    closing: dieselNumber(row.closing),
    litres: dieselNumber(row.litres),
    totalCost: dieselNumber(row.total_cost ?? row.totalCost),
    approvedBy: row.approved_by || row.approvedBy || "",
  };
}
function transactionPayload(input, previous = {}) {
  const machine = str(input.machine, previous.machine);
  if (!machine) {
    const err = new Error("Enter a machine.");
    err.status = 400;
    throw err;
  }
  const litres = numberValue(input.litres ?? previous.litres, "Litres");
  if (litres <= 0) throw invalid("Litres must be greater than zero.");
  const site = str(input.site, previous.site || "Grootegeluk");
  if (!["Grootegeluk", "Belfast", "Medupi", "Head Office"].includes(site)) throw invalid("Choose an MPG site.");
  const operator = str(input.operator, previous.operator);
  if (!operator && (!previous.id || previous.operator)) throw invalid("Enter the operator or driver name for this transaction.");
  return {
    work_date: isoDate(input.date ?? input.work_date ?? previous.date),
    work_time: optStr(input.time ?? input.work_time, previous.time),
    site,
    machine,
    operator,
    opening: cnum(input.opening ?? previous.opening),
    closing: cnum(input.closing ?? previous.closing),
    litres,
    total_cost: cnum(input.totalCost ?? previous.totalCost),
    approved_by: optStr(input.approvedBy, previous.approvedBy),
  };
}
export const transactions = makeCollection("diesel_transactions", ref.dieselTransactions, { toRow: transactionRow, toPayload: transactionPayload });

export const byType = {
  async list() {
    return consumptionByType(filterTransactions(await byMachine.list(), { site: "Grootegeluk" }));
  },
};

export const topConsumers = {
  async list() {
    return filterTransactions(await byMachine.list(), { site: "Grootegeluk" });
  },
};

function reconPayload(input, previous = {}) {
  const workDate = isoDate(input.date ?? input.work_date ?? previous.date);
  if (!workDate) {
    const err = new Error("Enter a date.");
    err.status = 400;
    throw err;
  }
  return {
    work_date: workDate,
    received: quantity(input.received ?? previous.received, "Received"),
    issued: quantity(input.issued ?? previous.issued, "Issued"),
    stock: quantity(input.stock ?? previous.stock, "Closing stock"),
    variance: quantity(input.variance ?? previous.variance, "Pump variance", -Infinity),
    status: optStr(input.status, previous.status) || "Review",
  };
}
export const dailyReconciliation = makeCollection("diesel_reconciliations", ref.dieselReconciliations, { toRow: reconciliationRow, toPayload: reconPayload });

function dieselFilters(filters = {}) {
  const selected = {
    operator: String(filters.operator || "").trim(),
    q: String(filters.q || "").trim(),
    site: String(filters.site || "").trim(),
    machine: String(filters.machine || "").trim(),
    from: filters.from ? isoDate(filters.from) : "",
    to: filters.to ? isoDate(filters.to) : "",
  };
  if (selected.from && selected.to && selected.from > selected.to) throw invalid("The end date cannot be before the start date.");
  return selected;
}

export async function getDieselRegisters(filters = {}) {
  const selected = dieselFilters(filters);
  const [allTransactions, fleet, hours, drivers] = await Promise.all([
    transactions.list(),
    readTable("equipment", catalog.equipment),
    getMachineHours({ site: "All sites", from: selected.from, to: selected.to }),
    // Driver records are optional suggestions. Captured operator names remain
    // usable even when the separate driver register is unavailable.
    readDrivers().catch(() => []),
  ]);
  const fleetMap = new Map(fleet.map((row) => [String(row.fleet_no || row.fleetNo || "").toUpperCase(), row]));
  const enriched = allTransactions.map((row) => ({ ...row, equipmentType: fleetMap.get(String(row.machine).toUpperCase())?.category || "Unclassified" }));
  const filtered = filterTransactions(enriched, selected);
  const machines = machineConsumption(filtered, fleet, hours.entries, selected);
  const ggRows = filterTransactions(filtered, { site: "Grootegeluk" });
  const ggMachines = filterTransactions(machines, { site: "Grootegeluk" });
  return {
    transactions: filtered,
    machines,
    byType: consumptionByType(ggMachines),
    topConsumers: ggMachines,
    summary: transactionTotals(filtered),
    ggSummary: transactionTotals(ggRows),
    operators: operatorNames(allTransactions, drivers),
    machineOptions: [...new Set(allTransactions.map((row) => String(row.machine || "").trim().toUpperCase()).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    hasUnassigned: allTransactions.some((row) => !row.operator?.trim()),
  };
}

function quantity(value, label, min = 0) {
  const raw = typeof value === "string" ? value.replace(/\s*L\s*$/i, "").replace(/[\s,]/g, "") : value;
  return String(numberValue(raw, label, { min }));
}
