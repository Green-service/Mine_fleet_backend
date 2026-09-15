import * as catalog from "../data/catalog.js";
import { recordSystemEvent } from "./notifications.js";
import { deleteRow, insertRow, readTable, updateRow } from "./store.js";
import { invalid } from "./validation.js";

const STATUSES = ["Active", "Off shift", "Suspended"];

function businessOptions() {
  return catalog.businessNames;
}

function persistDriver(input, previous = {}) {
  const name = String(input.name ?? previous.name ?? "").trim();
  const phone = String(input.phone ?? previous.phone ?? "").trim();
  const licenseNo = String(input.licenseNo ?? input.license_no ?? previous.licenseNo ?? "").trim();
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
  if (!/^\+?[\d ()-]+$/.test(phone) || phone.replace(/\D/g, "").length < 7 || phone.replace(/\D/g, "").length > 15) {
    throw invalid("Enter a valid mobile number with 7 to 15 digits.");
  }
  if (input.status !== undefined && !STATUSES.includes(input.status)) throw invalid("Choose a valid driver status.");
  const assetId = "assetId" in input || "asset_id" in input
    ? input.assetId ?? input.asset_id ?? null
    : previous.assetId ?? null;
  if (assetId !== null && typeof assetId !== "string") throw invalid("Choose a vehicle from the asset register.");
  return {
    name,
    phone,
    license_no: licenseNo,
    business: businessOptions().includes(input.business) ? input.business : previous.business || catalog.defaultBusinessName,
    status: STATUSES.includes(input.status) ? input.status : previous.status || "Active",
    asset_id: assetId?.trim() || null,
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
  const [assets, drivers] = await Promise.all([readTable("assets", catalog.assets), readDriversRaw()]);
  if (previousAssetId && previousAssetId !== assetId) {
    const prevAsset = assets.find((row) => row.id === previousAssetId);
    if (prevAsset && (prevAsset.assigned_driver_id === driverId || prevAsset.assignedDriverId === driverId)) {
      await updateRow("assets", previousAssetId, { assigned_driver_id: null }, catalog.assets);
    }
  }

  if (!assetId) return;

  for (const driver of drivers) {
    if (driver.id !== driverId && driver.asset_id === assetId) {
      await updateRow("drivers", driver.id, { asset_id: null }, catalog.drivers);
    }
  }

  const asset = assets.find((row) => row.id === assetId);
  if (asset) {
    await updateRow("assets", assetId, { assigned_driver_id: driverId }, catalog.assets);
  }
}

async function validateAssignedAsset(id) {
  if (!id) return;
  const assets = await readTable("assets", catalog.assets);
  const asset = assets.find((row) => row.id === id);
  if (!asset || asset.deleted_at || asset.deletedAt) throw Object.assign(new Error("Selected vehicle was not found. Refresh the asset register."), { status: 404 });
  if (asset.kind === "property") throw invalid("Drivers can only be assigned to vehicles.");
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
  await validateAssignedAsset(payload.asset_id);
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
  await validateAssignedAsset(payload.asset_id);
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
  const previous = (await readDriversRaw()).find((row) => row.id === id);
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
