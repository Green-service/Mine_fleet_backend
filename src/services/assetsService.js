import * as catalog from "../data/catalog.js";
import { recordSystemEvent } from "./notifications.js";
import { deleteRow, insertRow, readTable, updateRow } from "./store.js";
import { assessAssetCondition } from "./assetCondition.js";
import { buildAssetFinance } from "./assetFinance.js";
import { deleteAssetPhotos, isPhotoRef, resolveAssetPhotos } from "./storageService.js";

const VEHICLE_STATUSES = ["Active", "Workshop", "Standby", "Sold"];
const PROPERTY_STATUSES = ["Active", "Vacant", "Under renovation", "Sold"];
const VEHICLE_TYPES = ["Sedan", "SUV", "Hatchback", "Bakkie", "Minibus"];
const PROPERTY_TYPES = ["House", "Flat", "Stand", "Commercial", "Land", "Other"];
const KINDS = ["vehicle", "property"];
const BIN_RETENTION_DAYS = 30;

function isProperty(input = {}) {
  const kind = input.kind ?? input.asset_kind;
  return kind === "property";
}

function statusesFor(kind) {
  return kind === "property" ? PROPERTY_STATUSES : VEHICLE_STATUSES;
}

function typesFor(kind) {
  return kind === "property" ? PROPERTY_TYPES : VEHICLE_TYPES;
}

function businessOptions() {
  return catalog.businessNames;
}

function num(value) {
  const n = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function daysUntil(value) {
  if (!value) return 0;
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return 0;
  return Math.max(0, Math.ceil((target - Date.now()) / 86400000));
}

function isDeletedRow(row) {
  return Boolean(row.deleted_at ?? row.deletedAt);
}
function formatDate(value) {
  if (!value) return "";
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  return text;
}

function toIsoDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return `${parsed.getFullYear()}-${mm}-${dd}`;
}

function kmLeft(odometer, nextService) {
  return Math.max(0, num(nextService) - num(odometer));
}

function serviceStatus(odometer, nextService, nextDate) {
  const left = kmLeft(odometer, nextService);
  const dueDate = nextDate ? new Date(toIsoDate(nextDate) || nextDate) : null;
  const now = new Date();
  if (left <= 0 || (dueDate && dueDate <= now)) return "Overdue";
  if (left <= 1500 || (dueDate && dueDate <= new Date(now.getTime() + 14 * 86400000))) return "Due Soon";
  return "Scheduled";
}

function normalizePhotos(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(isPhotoRef).slice(0, 6);
}

function toAsset(row, driverName = "", finance = null) {
  const kind = KINDS.includes(row.kind) ? row.kind : "vehicle";
  const property = kind === "property";
  const odometer = num(row.odometer_km ?? row.odometerKm);
  const nextServiceKm = num(row.next_service_km ?? row.nextServiceKm);
  const nextServiceDate = row.next_service_date ?? row.nextServiceDate ?? "";
  const photos = normalizePhotos(row.photos);
  const purchaseCost = num(row.purchase_cost ?? row.purchaseCost);
  const allowedStatuses = statusesFor(kind);
  const defaultType = property ? "House" : "Sedan";
  const base = {
    id: row.id,
    kind,
    kindLabel: property ? "Property" : "Vehicle",
    assetCode: row.asset_code || row.assetCode || "",
    makeModel: row.make_model || row.makeModel || "",
    business: row.business || "Bolt rides",
    type: typesFor(kind).includes(row.type) ? row.type : defaultType,
    purchaseCost,
    purchaseCostLabel: `R ${purchaseCost.toLocaleString("en-ZA")}`,
    odometerKm: property ? 0 : odometer,
    odometerLabel: property ? "—" : `${odometer.toLocaleString("en-ZA")} km`,
    nextServiceKm: property ? 0 : nextServiceKm,
    nextServiceDate: property ? "—" : formatDate(nextServiceDate),
    nextServiceDateIso: property ? "" : toIsoDate(nextServiceDate) || "",
    serviceIntervalKm: property ? 0 : num(row.service_interval_km ?? row.serviceIntervalKm) || 15000,
    status: allowedStatuses.includes(row.status) ? row.status : "Active",
    assignedDriverId: property ? null : row.assigned_driver_id ?? row.assignedDriverId ?? null,
    assignedDriver: property ? "—" : driverName || row.assigned_driver_name || row.assignedDriver || "Unassigned",
    kmLeft: property ? 0 : kmLeft(odometer, nextServiceKm),
    serviceStatus: property ? "—" : serviceStatus(odometer, nextServiceKm, nextServiceDate),
    photos,
    deletedAt: row.deleted_at ?? row.deletedAt ?? null,
    purgeAfter: row.purge_after ?? row.purgeAfter ?? null,
    deletedAtLabel: formatDateTime(row.deleted_at ?? row.deletedAt),
    purgeAfterLabel: formatDateTime(row.purge_after ?? row.purgeAfter),
    daysLeft: daysUntil(row.purge_after ?? row.purgeAfter),
    daysLeftLabel: isDeletedRow(row)
      ? `${daysUntil(row.purge_after ?? row.purgeAfter)} day${daysUntil(row.purge_after ?? row.purgeAfter) === 1 ? "" : "s"} left`
      : "",
  };
  const withFinance = finance ? { ...base, finance } : base;
  return {
    ...withFinance,
    condition: property ? null : assessAssetCondition(base),
  };
}

function persistAsset(input, previous = {}) {
  const kind = KINDS.includes(input.kind) ? input.kind : KINDS.includes(previous.kind) ? previous.kind : "vehicle";
  const property = kind === "property";
  const assetCode = String(input.assetCode || input.asset_code || previous.assetCode || "").trim();
  const makeModel = String(input.makeModel || input.make_model || previous.makeModel || "").trim();
  if (!assetCode) {
    const err = new Error(property ? "Property reference is required." : "Registration or asset code is required.");
    err.status = 400;
    throw err;
  }
  if (!makeModel) {
    const err = new Error(property ? "Name and location are required." : "Make and model is required.");
    err.status = 400;
    throw err;
  }
  const business = String(input.business || previous.business || "Bolt rides").trim();
  const photos = input.photos !== undefined ? normalizePhotos(input.photos) : normalizePhotos(previous.photos);
  const allowedTypes = typesFor(kind);
  const allowedStatuses = statusesFor(kind);
  return {
    kind,
    asset_code: property ? assetCode.toUpperCase() : assetCode.toUpperCase(),
    make_model: makeModel,
    business: businessOptions().includes(business) ? business : catalog.defaultBusinessName,
    type: allowedTypes.includes(input.type) ? input.type : previous.type || (property ? "House" : "Sedan"),
    odometer_km: property ? 0 : num(input.odometerKm ?? input.odometer_km ?? previous.odometerKm),
    next_service_km: property ? 0 : num(input.nextServiceKm ?? input.next_service_km ?? previous.nextServiceKm),
    next_service_date: property
      ? null
      : toIsoDate(input.nextServiceDateIso ?? input.next_service_date ?? previous.nextServiceDateIso) || null,
    service_interval_km: property ? 0 : num(input.serviceIntervalKm ?? input.service_interval_km ?? previous.serviceIntervalKm) || 15000,
    status: allowedStatuses.includes(input.status) ? input.status : previous.status || "Active",
    assigned_driver_id: property ? null : input.assignedDriverId ?? input.assigned_driver_id ?? previous.assignedDriverId ?? null,
    purchase_cost: num(input.purchaseCost ?? input.purchase_cost ?? previous.purchaseCost),
    photos,
  };
}

async function readDriversRaw() {
  return readTable("drivers", catalog.drivers);
}

async function syncAssetDriver(assetId, driverId) {
  const [drivers, assets] = await Promise.all([readDriversRaw(), readAssetsRaw()]);
  const nextId = driverId || null;

  for (const driver of drivers) {
    const linkedAsset = driver.asset_id ?? driver.assetId;
    if (linkedAsset === assetId && driver.id !== nextId) {
      await updateRow("drivers", driver.id, { asset_id: null }, catalog.drivers);
    }
  }

  if (nextId) {
    const driver = drivers.find((row) => row.id === nextId);
    if (!driver) {
      const err = new Error("Driver not found");
      err.status = 404;
      throw err;
    }
    const oldAssetId = driver.asset_id ?? driver.assetId;
    if (oldAssetId && oldAssetId !== assetId) {
      await updateRow("assets", oldAssetId, { assigned_driver_id: null }, catalog.assets);
    }
    await updateRow("drivers", nextId, { asset_id: assetId }, catalog.drivers);
  } else {
    const assetRow = assets.find((row) => row.id === assetId);
    const linkedId = assetRow?.assigned_driver_id ?? assetRow?.assignedDriverId;
    if (linkedId) {
      await updateRow("drivers", linkedId, { asset_id: null }, catalog.drivers);
    }
  }

  await updateRow("assets", assetId, { assigned_driver_id: nextId }, catalog.assets);
}

async function readDriverMap() {
  const drivers = await readTable("drivers", catalog.drivers);
  return Object.fromEntries(drivers.map((d) => [d.id, d.name]));
}

async function readAllAssetsRaw() {
  return readTable("assets", catalog.assets);
}

async function permanentlyDeleteAsset(row) {
  const id = row.id;
  if (row.photos) await deleteAssetPhotos(normalizePhotos(row.photos));
  await deleteRow("assets", id, catalog.assets);
  for (const driver of catalog.drivers) {
    if (driver.asset_id === id || driver.assetId === id) {
      driver.asset_id = null;
      driver.assetId = null;
    }
  }
}

async function purgeExpiredAssets(rows) {
  const now = Date.now();
  for (const row of rows) {
    if (!isDeletedRow(row)) continue;
    const purgeAfter = new Date(row.purge_after ?? row.purgeAfter).getTime();
    if (!Number.isNaN(purgeAfter) && purgeAfter <= now) {
      await permanentlyDeleteAsset(row);
    }
  }
}

async function readAssetsRaw() {
  const rows = await readAllAssetsRaw();
  await purgeExpiredAssets(rows);
  return (await readAllAssetsRaw()).filter((row) => !isDeletedRow(row));
}

async function readBinAssetsRaw() {
  const rows = await readAllAssetsRaw();
  await purgeExpiredAssets(rows);
  return (await readAllAssetsRaw()).filter((row) => isDeletedRow(row));
}

export async function getAssets() {
  const [rows, binRows, driverMap, logs] = await Promise.all([
    readAssetsRaw(),
    readBinAssetsRaw(),
    readDriverMap(),
    readTable("asset_logs", catalog.assetLogs),
  ]);
  const assets = rows
    .map((row) => {
      const finance = buildAssetFinance(row, logs);
      return toAsset(row, row.assigned_driver_id ? driverMap[row.assigned_driver_id] : "", finance);
    })
    .sort((a, b) => String(a.assetCode).localeCompare(String(b.assetCode)));

  const binItems = binRows
    .map((row) => toAsset(row, row.assigned_driver_id ? driverMap[row.assigned_driver_id] : ""))
    .sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));

  const vehicles = assets.filter((row) => row.kind === "vehicle");
  const properties = assets.filter((row) => row.kind === "property");
  const active = assets.filter((row) => row.status === "Active").length;
  const assigned = vehicles.filter((row) => row.assignedDriverId).length;
  const dueSoon = vehicles.filter((row) => ["Due Soon", "Overdue"].includes(row.serviceStatus)).length;

  return {
    assets,
    bin: {
      items: binItems,
      kpis: {
        total: binItems.length,
        expiringSoon: binItems.filter((row) => row.daysLeft <= 7).length,
      },
    },
    businesses: businessOptions(),
    vehicleTypes: VEHICLE_TYPES,
    propertyTypes: PROPERTY_TYPES,
    vehicleStatuses: VEHICLE_STATUSES,
    propertyStatuses: PROPERTY_STATUSES,
    kpis: {
      total: assets.length,
      vehicles: vehicles.length,
      properties: properties.length,
      active,
      assigned,
      dueSoon,
      inBin: binItems.length,
    },
  };
}

export async function getAssetBin() {
  const [rows, driverMap] = await Promise.all([readBinAssetsRaw(), readDriverMap()]);
  const items = rows
    .map((row) => toAsset(row, row.assigned_driver_id ? driverMap[row.assigned_driver_id] : ""))
    .sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));

  return {
    items,
    kpis: {
      total: items.length,
      expiringSoon: items.filter((row) => row.daysLeft <= 7).length,
    },
  };
}

export async function createAsset(body, actor = null) {
  const property = isProperty(body);
  const incoming = normalizePhotos(body.photos);
  if (!property && !incoming.length) {
    const err = new Error("Upload at least one photo of the asset.");
    err.status = 400;
    throw err;
  }

  const id = crypto.randomUUID();
  const photoUrls = incoming.length ? await resolveAssetPhotos(incoming, id) : [];
  if (!property && !photoUrls.length) {
    const err = new Error("Upload at least one photo of the asset.");
    err.status = 400;
    throw err;
  }

  const payload = persistAsset({ ...body, photos: photoUrls });
  const existing = (await readAssetsRaw()).find((row) => (row.asset_code || row.assetCode) === payload.asset_code);
  if (existing) {
    const err = new Error("That registration is already on the register.");
    err.status = 409;
    throw err;
  }

  const saved = await insertRow("assets", { ...payload, id }, catalog.assets);
  const assignedDriverId = payload.kind === "property" ? null : body.assignedDriverId || body.assigned_driver_id || null;
  if (assignedDriverId) {
    await syncAssetDriver(id, assignedDriverId);
  }
  const driverMap = await readDriverMap();
  const asset = toAsset(
    { ...payload, ...saved, id, assigned_driver_id: assignedDriverId },
    assignedDriverId ? driverMap[assignedDriverId] : "",
  );
  await recordSystemEvent({
    title: "Asset added",
    detail: `${asset.assetCode} · ${asset.makeModel}`,
    kind: "production",
    actor,
    action: "added an asset",
    ctaPath: "/assets",
  });
  return asset;
}

export async function updateAsset(id, body, actor = null) {
  const rows = await readAssetsRaw();
  const previous = rows.find((row) => row.id === id);
  if (!previous) {
    const err = new Error("Asset not found");
    err.status = 404;
    throw err;
  }

  const previousPhotos = normalizePhotos(previous.photos);
  const incoming = body.photos !== undefined ? normalizePhotos(body.photos) : previousPhotos;
  const photoUrls = await resolveAssetPhotos(incoming, id);
  const prevKind = KINDS.includes(previous.kind) ? previous.kind : "vehicle";
  const nextKind = KINDS.includes(body.kind) ? body.kind : prevKind;
  const prevDriverId = previous.assigned_driver_id ?? previous.assignedDriverId ?? null;
  const nextDriverId = nextKind === "property"
    ? null
    : "assignedDriverId" in body || "assigned_driver_id" in body
      ? (body.assignedDriverId || body.assigned_driver_id || null)
      : prevDriverId;

  const payload = persistAsset({ ...body, photos: photoUrls, assignedDriverId: nextDriverId }, toAsset(previous));

  const removedPhotos = previousPhotos.filter(
    (url) => /^https?:\/\//i.test(url) && !photoUrls.includes(url),
  );
  if (removedPhotos.length) await deleteAssetPhotos(removedPhotos);

  const clash = rows.find((row) => (row.asset_code || row.assetCode) === payload.asset_code && row.id !== id);
  if (clash) {
    const err = new Error("That registration is already on the register.");
    err.status = 409;
    throw err;
  }
  const saved = await updateRow("assets", id, payload, catalog.assets);
  if (String(nextDriverId || "") !== String(prevDriverId || "")) {
    await syncAssetDriver(id, nextDriverId);
  }
  const driverMap = await readDriverMap();
  const asset = toAsset({ ...previous, ...payload, ...saved, id, assigned_driver_id: nextDriverId }, driverMap[nextDriverId]);
  await recordSystemEvent({
    title: "Asset updated",
    detail: `${asset.assetCode} · ${asset.makeModel}`,
    kind: "production",
    actor,
    action: "updated an asset",
    ctaPath: "/assets",
  });
  return asset;
}

export async function removeAsset(id, actor = null) {
  const rows = await readAllAssetsRaw();
  const previous = rows.find((row) => row.id === id);
  if (!previous) {
    const err = new Error("Asset not found");
    err.status = 404;
    throw err;
  }
  if (isDeletedRow(previous)) {
    const err = new Error("Asset is already in the bin");
    err.status = 400;
    throw err;
  }

  const deletedAt = new Date().toISOString();
  const purgeAfter = new Date(Date.now() + BIN_RETENTION_DAYS * 86400000).toISOString();
  const prevDriverId = previous.assigned_driver_id ?? previous.assignedDriverId ?? null;

  if (prevDriverId) {
    await syncAssetDriver(id, null);
  }

  await updateRow(
    "assets",
    id,
    {
      deleted_at: deletedAt,
      purge_after: purgeAfter,
      deleted_by_name: actor?.name || null,
      deleted_by_email: actor?.email || null,
      assigned_driver_id: null,
    },
    catalog.assets,
  );

  const code = previous.asset_code || previous.assetCode || "Asset";
  await recordSystemEvent({
    title: "Asset moved to bin",
    detail: `${code} · permanently removed after ${BIN_RETENTION_DAYS} days`,
    kind: "production",
    actor,
    action: "moved an asset to the bin",
    ctaPath: "/assets",
  });
  return { ok: true, deletedAt, purgeAfter, retentionDays: BIN_RETENTION_DAYS };
}

export async function restoreAsset(id, actor = null) {
  const rows = await readBinAssetsRaw();
  const previous = rows.find((row) => row.id === id);
  if (!previous) {
    const err = new Error("Asset not found in bin");
    err.status = 404;
    throw err;
  }

  const clash = (await readAssetsRaw()).find(
    (row) => (row.asset_code || row.assetCode) === (previous.asset_code || previous.assetCode),
  );
  if (clash) {
    const err = new Error("Another active asset already uses this reference.");
    err.status = 409;
    throw err;
  }

  await updateRow(
    "assets",
    id,
    {
      deleted_at: null,
      purge_after: null,
      deleted_by_name: null,
      deleted_by_email: null,
    },
    catalog.assets,
  );

  const code = previous.asset_code || previous.assetCode || "Asset";
  await recordSystemEvent({
    title: "Asset restored",
    detail: code,
    kind: "production",
    actor,
    action: "restored an asset from the bin",
    ctaPath: "/assets",
  });

  const driverMap = await readDriverMap();
  return toAsset(
    { ...previous, deleted_at: null, purge_after: null },
    previous.assigned_driver_id ? driverMap[previous.assigned_driver_id] : "",
  );
}

export async function getAssetById(id) {
  const rows = await readAssetsRaw();
  const row = rows.find((item) => item.id === id);
  if (!row) {
    const err = new Error("Asset not found");
    err.status = 404;
    throw err;
  }
  const driverMap = await readDriverMap();
  const logs = await readTable("asset_logs", catalog.assetLogs);
  const finance = buildAssetFinance(row, logs);
  return toAsset(row, row.assigned_driver_id ? driverMap[row.assigned_driver_id] : "", finance);
}

export { assessAssetCondition };

export async function listAssetsForSelect() {
  const data = await getAssets();
  return data.assets.map((row) => ({ id: row.id, label: `${row.assetCode} · ${row.makeModel}` }));
}
