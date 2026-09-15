import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RUNTIME_DIR = process.env.MPG_RUNTIME_DIR || path.join(root, "data", "runtime");

export const TABLE_CATALOG_KEYS = {
  production_shifts: "productionDaily",
  machine_hours: "machineHoursBlf",
  equipment: "equipment",
  diesel_issues: "dieselIssues",
  work_orders: "workOrders",
  breakdowns: "breakdowns",
  safety_actions: "safetyActions",
  employees: "employees",
  leave_requests: "leave",
  claims: "claims",
  purchase_orders: "purchaseOrders",
  purchase_requests: "purchaseRequests",
  machine_costs: "machineCosts",
  app_settings: "appSettings",
  businesses: "businesses",
  assets: "assets",
  drivers: "drivers",
  asset_logs: "assetLogs",
  portfolio_documents: "portfolioDocuments",
  notifications: "notifications",
  activity_log: "activity",
  business_transactions: "businessTransactions",
  business_monthly_trend: "businessMonthlyTrend",
};

function tablePath(table) {
  return path.join(RUNTIME_DIR, `${table}.json`);
}

export function readRuntime(table) {
  try {
    const raw = fs.readFileSync(tablePath(table), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw Object.assign(new Error(`Cannot read the saved ${table.replaceAll("_", " ")} register. Check local storage before retrying.`), { status: 503 });
  }
}

export function writeRuntime(table, rows) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  const destination = tablePath(table);
  const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(rows, null, 2), "utf8");
    fs.renameSync(temporary, destination);
  } catch (error) {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    throw Object.assign(new Error(`Cannot save the ${table.replaceAll("_", " ")} register. Check local storage and retry.`), { status: 503 });
  }
}

export function hydrateCatalog(catalog) {
  let loaded = 0;
  for (const [table, key] of Object.entries(TABLE_CATALOG_KEYS)) {
    const saved = readRuntime(table);
    if (!Array.isArray(saved)) continue;
    const target = catalog[key];
    if (Array.isArray(target)) {
      target.length = 0;
      target.push(...saved);
      loaded += saved.length;
      continue;
    }
    if (target && typeof target === "object") {
      Object.assign(target, saved[0]);
      loaded += 1;
    }
  }
  if (loaded) {
    console.log(`[persist] Restored ${loaded} saved register rows from local storage`);
  }
}

export function syncRuntime(table, fallbackList) {
  const rows = Array.isArray(fallbackList) ? [...fallbackList] : [];
  writeRuntime(table, rows);
  return rows;
}
