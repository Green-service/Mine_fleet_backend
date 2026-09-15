import * as ref from "../data/referenceCatalog.js";
import { makeCollection, optStr, str } from "./collectionService.js";
import { readTable } from "./store.js";
import { invalid, isoDate, numberValue } from "./validation.js";
import { calendarDate, dateRange, inDateRange, weekBounds } from "./productionDates.js";

export const GG_COLUMNS = {
  productLoader: "product_loader", sscc: "sscc", pci: "pci", snSs2: "sn_ss2",
  p2cSs2Be: "p2c_ss2_be", buffaloLoader: "buffalo_loader", screen: "screen",
};
const amount = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const rounded = (value) => Number(value.toPrecision(15));

function categorized(row) {
  return Object.entries(GG_COLUMNS).some(([field, column]) => row[column] != null || row[field] != null);
}

export function ggDailyRow(row) {
  const isLegacyTotal = !categorized(row);
  const categories = Object.fromEntries(Object.entries(GG_COLUMNS).map(([field, column]) => [field, isLegacyTotal ? null : amount(row[column] ?? row[field])]));
  const total = isLegacyTotal ? amount(row.actual ?? row.total) : rounded(Object.values(categories).reduce((sum, value) => sum + value, 0));
  const target = amount(row.target);
  const pct = target ? Number(((total / target) * 100).toFixed(1)) : 0;
  return {
    id: row.id, date: calendarDate(row.work_date ?? row.date), ...categories,
    total, actual: total, target, variance: rounded(total - target), pct,
    status: target ? pct >= 100 ? "Above Target" : "Below Target" : "No target",
    isLegacyTotal, legacyTonnage: isLegacyTotal ? total : 0,
  };
}

function ggDailyPayload(input, previous = {}) {
  const workDate = isoDate(input.date ?? input.work_date ?? previous.date ?? previous.work_date, "Production date");
  const suppliedCategories = Object.entries(GG_COLUMNS).some(([field, column]) => {
    const value = input[field] ?? input[column];
    return value != null && String(value).trim() !== "";
  });
  const hasCategories = categorized(previous) || suppliedCategories;
  if (!previous.id && !hasCategories && input.actual == null) throw invalid("Enter the daily production categories.");
  const target = numberValue(input.target ?? previous.target, "Daily target");
  const payload = { work_date: workDate, target };
  let total = 0;
  if (hasCategories) {
    for (const [field, column] of Object.entries(GG_COLUMNS)) {
      const value = numberValue(input[field] ?? input[column] ?? previous[field] ?? previous[column], field);
      payload[column] = value;
      total += value;
    }
    total = rounded(total);
  } else {
    // Keep pre-category daily entries intact; do not invent an allocation.
    total = numberValue(input.actual ?? previous.actual ?? previous.total, "Daily actual tonnage");
    for (const column of Object.values(GG_COLUMNS)) payload[column] = null;
  }
  payload.total = total;
  payload.actual = total;
  payload.variance = rounded(total - target);
  payload.pct = target ? Number(((total / target) * 100).toFixed(1)) : 0;
  payload.status = target ? payload.pct >= 100 ? "Above Target" : "Below Target" : "No target";
  return payload;
}

export const ggDaily = makeCollection("production_gg_daily", ref.productionGgDaily, {
  toRow: ggDailyRow, toPayload: ggDailyPayload, uniqueBy: ["work_date"],
});

export function summarizeActualWeeks(daily, query = {}) {
  const range = dateRange(query);
  const weeks = new Map();
  for (const source of daily) {
    const row = ggDailyRow(source);
    const date = calendarDate(row.date ?? row.work_date);
    if (!date || !inDateRange(date, range)) continue;
    const bounds = weekBounds(date);
    if (!weeks.has(bounds.weekStart)) {
      weeks.set(bounds.weekStart, {
        id: bounds.weekStart, ...bounds, range: `${bounds.weekStart} to ${bounds.weekEnd}`,
        ...Object.fromEntries(Object.keys(GG_COLUMNS).map((field) => [field, 0])),
        total: 0, target: 0, categorizedTotal: 0, legacyTonnage: 0,
        dayCount: 0, categorizedDayCount: 0, legacyDayCount: 0,
      });
    }
    const week = weeks.get(bounds.weekStart);
    week.total += amount(row.total ?? row.actual);
    week.target += amount(row.target);
    week.dayCount += 1;
    if (row.isLegacyTotal) {
      week.legacyTonnage += amount(row.total ?? row.actual);
      week.legacyDayCount += 1;
    } else {
      for (const field of Object.keys(GG_COLUMNS)) week[field] += amount(row[field]);
      week.categorizedTotal += amount(row.total ?? row.actual);
      week.categorizedDayCount += 1;
    }
  }
  return [...weeks.values()].map((week) => ({
    ...week,
    ...Object.fromEntries(Object.keys(GG_COLUMNS).map((field) => [field, week.categorizedDayCount ? rounded(week[field]) : null])),
    total: rounded(week.total), target: rounded(week.target), categorizedTotal: rounded(week.categorizedTotal), legacyTonnage: rounded(week.legacyTonnage),
    source: "daily", isDerived: true,
  })).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

export const ggWeek = {
  async list(query = {}) {
    dateRange(query);
    return summarizeActualWeeks(await ggDaily.list(), query);
  },
};

// Existing manually entered weeks remain accessible, but cannot be combined
// with daily-derived weeks without counting the same production twice.
export const ggWeekLegacy = {
  async list() {
    const rows = await readTable("production_gg_week", ref.productionGgWeek);
    return rows.map((row) => ({
      id: row.id, week: str(row.week), range: optStr(row.range),
      ...Object.fromEntries(Object.entries(GG_COLUMNS).map(([field, column]) => [field, row[column] ?? null])),
      total: amount(row.total), source: "legacy-weekly", isLegacyWeekly: true,
    }));
  },
};
