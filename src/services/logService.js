import * as catalog from "../data/catalog.js";
import { deleteRow, insertRow, readTable, updateRow } from "./store.js";
import { buildAssetFinance, buildBusinessRollup, money, projectFromLogs } from "./assetFinance.js";
import { recordSystemEvent } from "./notifications.js";
import { readBusinessRows } from "./businessesService.js";

const PERIOD_TYPES = ["weekly", "monthly", "once"];
const ENTRY_TYPES = ["income", "expense"];

function num(value) {
  const n = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function isExpenseRow(row) {
  return String(row.entry_type || row.entryType || "income").toLowerCase() === "expense";
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

async function readAssetsRaw() {
  return readTable("assets", catalog.assets);
}

async function readLogsRaw() {
  return readTable("asset_logs", catalog.assetLogs);
}

function periodLabel(periodType, entryType) {
  if (entryType === "expense") {
    if (periodType === "weekly") return "Recurring · weekly";
    if (periodType === "monthly") return "Recurring · monthly";
    return "Once off";
  }
  if (periodType === "weekly") return "Weekly";
  if (periodType === "once") return "Once off";
  return "Monthly";
}

function normalizePhotos(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && item).slice(0, 6);
}

function toLog(row, assetMap = {}) {
  const assetId = row.asset_id || row.assetId;
  const asset = assetMap[assetId];
  const entryType = ENTRY_TYPES.includes(row.entry_type || row.entryType)
    ? (row.entry_type || row.entryType)
    : "income";
  const expense = entryType === "expense";
  const income = expense ? 0 : num(row.income);
  const deductions = expense ? num(row.amount ?? row.deductions) : num(row.deductions);
  const amount = expense ? deductions : income;
  const net = income - deductions;
  const periodType = PERIOD_TYPES.includes(row.period_type || row.periodType)
    ? (row.period_type || row.periodType)
    : expense ? "once" : "monthly";
  const category = row.category || "";

  return {
    id: row.id,
    assetId,
    assetCode: asset?.asset_code || asset?.assetCode || row.asset_code || "—",
    assetMakeModel: asset?.make_model || asset?.makeModel || "",
    assetPhoto: normalizePhotos(asset?.photos)[0] || null,
    assetLabel: asset ? `${asset.asset_code || asset.assetCode} · ${asset.make_model || asset.makeModel}` : "—",
    business: row.business || asset?.business || "",
    entryType,
    entryLabel: expense ? "Expense" : "Income",
    frequencyLabel: periodLabel(periodType, entryType),
    category,
    categoryLabel: category || "—",
    periodType,
    periodLabel: periodLabel(periodType, entryType),
    periodStart: formatDate(row.period_start || row.periodStart),
    periodStartIso: toIsoDate(row.period_start || row.periodStart) || "",
    income,
    incomeLabel: expense ? "—" : money(income),
    deductions,
    deductionsLabel: expense ? "—" : money(deductions),
    amount,
    amountLabel: expense ? money(amount) : "—",
    net,
    netLabel: money(net),
    notes: row.notes || "",
    loggedByName: row.logged_by_name || row.loggedByName || "",
    loggedByEmail: row.logged_by_email || row.loggedByEmail || "",
    loggedByLabel: row.logged_by_name || row.loggedByName || "—",
    projection: expense ? null : projectFromLogs([row]),
  };
}

async function assetMap() {
  const assets = await readAssetsRaw();
  return Object.fromEntries(assets.map((row) => [row.id, row]));
}

function persistLog(input, previous = {}, assetRow = null, actor = null) {
  const assetId = String(input.assetId || input.asset_id || previous.assetId || "").trim();
  if (!assetId) {
    const err = new Error("Select an asset for this log.");
    err.status = 400;
    throw err;
  }

  const entryType = ENTRY_TYPES.includes(input.entryType || input.entry_type || previous.entryType)
    ? (input.entryType || input.entry_type || previous.entryType)
    : "income";
  const expense = entryType === "expense";
  const periodStart = toIsoDate(input.periodStartIso ?? input.period_start ?? previous.periodStartIso);
  if (!periodStart) {
    const err = new Error("Date is required.");
    err.status = 400;
    throw err;
  }

  if (expense) {
    const amount = num(input.amount ?? input.deductions ?? previous.amount ?? previous.deductions);
    const category = String(input.category || previous.category || "").trim();
    const periodType = ["once", "weekly", "monthly"].includes(input.periodType || input.period_type || previous.periodType)
      ? (input.periodType || input.period_type || previous.periodType)
      : "once";
    if (amount <= 0) {
      const err = new Error("Enter an expense amount.");
      err.status = 400;
      throw err;
    }
    if (!category) {
      const err = new Error("Select an expense category.");
      err.status = 400;
      throw err;
    }

    return {
      asset_id: assetId,
      business: assetRow?.business || input.business || previous.business || "",
      entry_type: "expense",
      category,
      period_type: periodType,
      period_start: periodStart,
      income: 0,
      deductions: amount,
      notes: String(input.notes || previous.notes || "").trim(),
      logged_by_name: actor?.name || previous.loggedByName || input.loggedByName || null,
      logged_by_email: actor?.email || previous.loggedByEmail || input.loggedByEmail || null,
    };
  }

  const periodType = PERIOD_TYPES.includes(input.periodType || input.period_type)
    ? (input.periodType || input.period_type)
    : previous.periodType || "monthly";
  const income = num(input.income ?? previous.income);
  const deductions = num(input.deductions ?? previous.deductions);
  if (income <= 0 && deductions <= 0) {
    const err = new Error("Enter income or deductions for this period.");
    err.status = 400;
    throw err;
  }

  return {
    asset_id: assetId,
    business: assetRow?.business || input.business || previous.business || "",
    entry_type: "income",
    category: null,
    period_type: periodType,
    period_start: periodStart,
    income,
    deductions,
    notes: String(input.notes || previous.notes || "").trim(),
    logged_by_name: actor?.name || previous.loggedByName || input.loggedByName || null,
    logged_by_email: actor?.email || previous.loggedByEmail || input.loggedByEmail || null,
  };
}

export async function getLogData() {
  const [assets, logs, businessRows] = await Promise.all([readAssetsRaw(), readLogsRaw(), readBusinessRows()]);
  const map = Object.fromEntries(assets.map((row) => [row.id, row]));
  const entries = logs
    .map((row) => toLog(row, map))
    .sort((a, b) => String(b.periodStartIso).localeCompare(String(a.periodStartIso)));

  const assetOptions = assets.map((row) => ({
    id: row.id,
    label: `${row.asset_code || row.assetCode} · ${row.make_model || row.makeModel}`,
    business: row.business,
    purchaseCost: num(row.purchase_cost ?? row.purchaseCost),
  }));

  const assetFinance = assets.map((row) => {
    const finance = buildAssetFinance(row, logs);
    return {
      id: row.id,
      assetCode: row.asset_code || row.assetCode,
      makeModel: row.make_model || row.makeModel,
      business: row.business,
      assetPhoto: normalizePhotos(row.photos)[0] || null,
      ...finance,
    };
  });

  const incomeEntries = entries.filter((row) => row.entryType === "income");
  const expenseEntries = entries.filter((row) => row.entryType === "expense");
  const totalIncome = incomeEntries.reduce((sum, row) => sum + row.income, 0);
  const periodDeductions = incomeEntries.reduce((sum, row) => sum + row.deductions, 0);
  const totalExpenses = expenseEntries.reduce((sum, row) => sum + row.amount, 0);
  const totalDeductions = periodDeductions + totalExpenses;
  const netLogged = totalIncome - totalDeductions;
  const inProfit = assetFinance.filter((row) => row.profitStatus === "In profit").length;
  const portfolioProjection = projectFromLogs(logs.filter((row) => !isExpenseRow(row)));

  return {
    logs: entries,
    assets: assetOptions,
    businesses: businessRows.map((row) => row.name).filter(Boolean),
    expenseCategories: catalog.expenseCategories,
    assetFinance,
    businessRollup: buildBusinessRollup(assets, logs),
    kpis: {
      totalIncome,
      totalIncomeLabel: money(totalIncome),
      totalExpenses,
      totalExpensesLabel: money(totalExpenses),
      totalDeductions,
      totalDeductionsLabel: money(totalDeductions),
      netLogged,
      netLoggedLabel: money(netLogged),
      inProfit,
      projectedAnnualNet: portfolioProjection.annualNet,
      projectedAnnualNetLabel: portfolioProjection.annualNetLabel,
    },
    projection: portfolioProjection,
  };
}

export async function createLog(body, actor = null) {
  const map = await assetMap();
  const assetRow = map[body.assetId || body.asset_id];
  if (!assetRow) {
    const err = new Error("Asset not found");
    err.status = 404;
    throw err;
  }
  const payload = persistLog(body, {}, assetRow, actor);
  const saved = await insertRow("asset_logs", payload, catalog.assetLogs);
  const log = toLog({ ...payload, ...saved }, map);

  const expense = payload.entry_type === "expense";
  const summary = expense
    ? `${log.categoryLabel} expense of ${log.amountLabel}`
    : `Income ${log.incomeLabel} with ${log.deductionsLabel} deductions (net ${log.netLabel})`;
  await recordSystemEvent({
    title: `New ${expense ? "expense" : "income"} log`,
    detail: `${log.assetLabel} · ${log.business} · ${summary}`,
    kind: expense ? "finance" : "production",
    actor,
    action: `logged a new ${expense ? "expense" : "income"} entry`,
    emailSubject: `New ${expense ? "expense" : "income"} log — ${log.assetLabel}`,
    emailMessage: [
      `Asset: ${log.assetLabel}`,
      `Business: ${log.business}`,
      `Date: ${log.periodStart}`,
      summary,
      log.notes ? `Notes: ${log.notes}` : "",
    ].filter(Boolean).join("\n"),
    ctaPath: "/log",
  });

  return log;
}

export async function updateLog(id, body, actor = null) {
  const [logs, map] = await Promise.all([readLogsRaw(), assetMap()]);
  const previous = logs.find((row) => row.id === id);
  if (!previous) {
    const err = new Error("Log entry not found");
    err.status = 404;
    throw err;
  }
  const assetId = body.assetId || body.asset_id || previous.asset_id;
  const assetRow = map[assetId];
  const payload = persistLog(body, toLog(previous, map), assetRow, actor);
  const saved = await updateRow("asset_logs", id, payload, catalog.assetLogs);
  const log = toLog({ ...previous, ...payload, ...saved, id }, map);
  await recordSystemEvent({
    title: "Log entry updated",
    detail: `${log.assetLabel} · ${log.business}`,
    kind: "finance",
    actor,
    action: "updated a log entry",
    ctaPath: "/log",
  });
  return log;
}

export async function removeLog(id, actor = null) {
  const [logs, map] = await Promise.all([readLogsRaw(), assetMap()]);
  const previous = logs.find((row) => row.id === id);
  await deleteRow("asset_logs", id, catalog.assetLogs);
  if (previous) {
    const log = toLog(previous, map);
    await recordSystemEvent({
      title: "Log entry removed",
      detail: `${log.assetLabel} · ${log.business}`,
      kind: "finance",
      actor,
      action: "deleted a log entry",
      ctaPath: "/log",
    });
  }
  return { ok: true };
}

export async function getLogsForAsset(assetId) {
  const logs = await readLogsRaw();
  return logs.filter((row) => (row.asset_id || row.assetId) === assetId);
}
