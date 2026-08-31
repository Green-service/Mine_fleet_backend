import * as catalog from "../data/catalog.js";
import { recordSystemEvent } from "./notifications.js";
import { deleteRow, insertRow, readTable, updateRow } from "./store.js";

const STATUSES = ["Active", "Off shift", "Suspended"];

function businessOptions() {
  return catalog.businessNames;
}

function persistDriver(input, previous = {}) {
  const name = String(input.name || previous.name || "").trim();
  const phone = String(input.phone || previous.phone || "").trim();
  const licenseNo = String(input.licenseNo || input.license_no || previous.licenseNo || "").trim();
  if (!name) {
    const err = new Error("Driver name is required.");
    err.status = 400;
    throw err;
  }
  if (!phone) {
    const err = new Error("Mobile number is required.");
    err.status = 400;
    throw err;
  }
  return {
    name,
    phone,
    license_no: licenseNo,
    business: businessOptions().includes(input.business) ? input.business : previous.business || catalog.defaultBusinessName,
    status: STATUSES.includes(input.status) ? input.status : previous.status || "Active",
    asset_id: input.assetId ?? input.asset_id ?? previous.assetId ?? null,
  };
}

function toDriver(row, assetLabel = "Unassigned") {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    licenseNo: row.license_no || row.licenseNo || "—",
    business: row.business || "Bolt rides",
    status: row.status || "Active",
    assetId: row.asset_id ?? row.assetId ?? null,
    assetLabel,
  };
}

async function readAssetsMap() {
  const assets = await readTable("assets", catalog.assets);
  return Object.fromEntries(
    assets.map((row) => [row.id, `${row.asset_code || row.assetCode} · ${row.make_model || row.makeModel}`]),
  );
}

async function syncAssignment(driverId, assetId, previousAssetId = null) {
  if (previousAssetId && previousAssetId !== assetId) {
    const prevAsset = catalog.assets.find((row) => row.id === previousAssetId);
    if (prevAsset && (prevAsset.assigned_driver_id === driverId || prevAsset.assignedDriverId === driverId)) {
      prevAsset.assigned_driver_id = null;
      await updateRow("assets", previousAssetId, { assigned_driver_id: null }, catalog.assets).catch(() => {});
    }
  }

  if (!assetId) return;

  for (const driver of catalog.drivers) {
    if (driver.id !== driverId && driver.asset_id === assetId) {
      driver.asset_id = null;
      await updateRow("drivers", driver.id, { asset_id: null }, catalog.drivers).catch(() => {});
    }
  }

  const asset = catalog.assets.find((row) => row.id === assetId);
  if (asset) {
    asset.assigned_driver_id = driverId;
    await updateRow("assets", assetId, { assigned_driver_id: driverId }, catalog.assets).catch(() => {});
  }
}

async function readDriversRaw() {
  return readTable("drivers", catalog.drivers);
}

export async function getDrivers() {
  const [rows, assetMap] = await Promise.all([readDriversRaw(), readAssetsMap()]);
  const drivers = rows
    .map((row) => toDriver(row, row.asset_id ? assetMap[row.asset_id] : "Unassigned"))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    drivers,
    businesses: businessOptions(),
    kpis: {
      total: drivers.length,
      active: drivers.filter((row) => row.status === "Active").length,
      assigned: drivers.filter((row) => row.assetId).length,
      unassigned: drivers.filter((row) => !row.assetId).length,
    },
  };
}

export async function createDriver(body, actor = null) {
  const payload = persistDriver(body);
  const saved = await insertRow("drivers", payload, catalog.drivers);
  const row = toDriver({ ...payload, ...saved });
  if (payload.asset_id) {
    await syncAssignment(saved.id, payload.asset_id);
    const assetMap = await readAssetsMap();
    row.assetLabel = assetMap[payload.asset_id] || "Assigned";
    row.assetId = payload.asset_id;
  }
  await recordSystemEvent({
    title: "Driver added",
    detail: `${row.name} · ${row.business}`,
    kind: "production",
    actor,
    action: "added a driver",
    ctaPath: "/drivers",
  });
  return row;
}

export async function updateDriver(id, body, actor = null) {
  const rows = await readDriversRaw();
  const previous = rows.find((row) => row.id === id);
  if (!previous) {
    const err = new Error("Driver not found");
    err.status = 404;
    throw err;
  }
  const prevAssetId = previous.asset_id ?? previous.assetId ?? null;
  const payload = persistDriver(body, toDriver(previous));
  const saved = await updateRow("drivers", id, payload, catalog.drivers);
  await syncAssignment(id, payload.asset_id, prevAssetId);
  const assetMap = await readAssetsMap();
  const row = toDriver({ ...previous, ...payload, ...saved, id }, payload.asset_id ? assetMap[payload.asset_id] : "Unassigned");
  await recordSystemEvent({
    title: "Driver updated",
    detail: row.name,
    kind: "production",
    actor,
    action: "updated a driver",
    ctaPath: "/drivers",
  });
  return row;
}

export async function removeDriver(id, actor = null) {
  const previous = catalog.drivers.find((row) => row.id === id);
  if (previous?.asset_id) {
    await syncAssignment(id, null, previous.asset_id);
  }
  const name = previous?.name || "Driver";
  await deleteRow("drivers", id, catalog.drivers);
  await recordSystemEvent({
    title: "Driver removed",
    detail: name,
    kind: "production",
    actor,
    action: "removed a driver",
    ctaPath: "/drivers",
  });
  return { ok: true };
}

export async function assignDriver(id, assetId, actor = null) {
  return updateDriver(id, { assetId: assetId || null }, actor);
}
