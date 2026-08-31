import * as catalog from "../data/catalog.js";
import { recordSystemEvent } from "./notifications.js";
import { deleteRow, insertRow, readTable, updateRow } from "./store.js";

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
    notes: row.notes || "",
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
  const litres = num(input.litres ?? previous.litres);
  if (litres <= 0) {
    const err = new Error("Enter litres filled.");
    err.status = 400;
    throw err;
  }
  const odometerKm = num(input.odometerKm ?? input.odometer_km ?? previous.odometerKm);
  if (odometerKm <= 0) {
    const err = new Error("Enter the odometer reading (km).");
    err.status = 400;
    throw err;
  }

  return {
    asset_id: assetId,
    business: assetRow?.business || input.business || previous.business || "Bolt rides",
    work_date: formatIso(input.date || input.work_date || input.workDate || previous.workDate || new Date()),
    fuel_type: FUEL_TYPES.includes(input.fuelType || input.fuel_type) ? (input.fuelType || input.fuel_type) : (previous.fuelType || "Petrol 95"),
    litres,
    odometer_km: odometerKm,
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

export async function getDiesel() {
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
    business: row.business,
    fuelType: String(row.make_model || row.makeModel).toLowerCase().includes("ranger") ? "Diesel 50" : "Petrol 95",
  }));

  return {
    fills,
    assets: assetOptions,
    fuelTypes: FUEL_TYPES,
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
  const saved = await insertRow("diesel_issues", payload, catalog.dieselIssues);
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
