import * as catalog from "../data/catalog.js";
import * as ref from "../data/referenceCatalog.js";
import { deleteRow, insertRow, readTable, updateRow } from "./store.js";
import { makeCollection, num as cnum, optStr } from "./collectionService.js";
import { invalid, isoDate, numberValue, validateInput } from "./validation.js";
import { ggDaily } from "./productionTonnage.js";
import { calendarDate } from "./productionDates.js";
import { machineReference } from "./productionMachine.js";
export { ggDaily, ggWeek, ggWeekLegacy } from "./productionTonnage.js";
export { getMachineHours } from "./machineHoursService.js";

const SITE_CODE = {
  gg: "GG",
  grootegeluk: "GG",
  medupi: "Medupi",
  med: "Medupi",
  blf: "BLF",
  belfast: "BLF",
};

const SITE_ORDER = { GG: 0, Medupi: 1, BLF: 2 };

function num(value) {
  const n = Number(value);
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
  const date = parseDate(value);
  if (!date) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function formatIso(value) {
  const date = parseDate(value);
  if (!date) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function sameDay(value, asOf) {
  const date = parseDate(value);
  return Boolean(date && date.getFullYear() === asOf.getFullYear() && date.getMonth() === asOf.getMonth() && date.getDate() === asOf.getDate());
}

function sameMonth(value, asOf) {
  const date = parseDate(value);
  return Boolean(date && date.getFullYear() === asOf.getFullYear() && date.getMonth() === asOf.getMonth());
}

export function normalizeSite(site) {
  return SITE_CODE[String(site || "").trim().toLowerCase()] || String(site || "GG").trim();
}

function isTrackedSite(site) {
  const code = normalizeSite(site);
  return code === "GG" || code === "Medupi";
}

function toDailyRow(row) {
  const workDate = row.work_date || row.workDate || row.date;
  return {
    id: row.id,
    date: formatDmy(workDate),
    workDate: formatIso(workDate),
    site: normalizeSite(row.site),
    shift: row.shift || "Day Shift",
    target: num(row.target),
    actual: num(row.actual),
    challenges: row.challenges || "No major note captured",
  };
}

function toHourRow(row) {
  return {
    id: row.id,
    date: calendarDate(row.work_date ?? row.workDate ?? row.date),
    machine: row.machine,
    equipment: row.equipment,
    site: row.site || "Belfast",
    hours: num(row.hours),
    downtime: num(row.downtime),
    standby: num(row.standby),
    pm: num(row.pm),
    status: row.status,
    remarks: row.remarks,
  };
}

function sortDaily(rows) {
  return [...rows].sort((a, b) => {
    const siteDelta = (SITE_ORDER[a.site] ?? 9) - (SITE_ORDER[b.site] ?? 9);
    if (siteDelta) return siteDelta;
    const aDate = parseDate(a.workDate || a.date)?.getTime() || 0;
    const bDate = parseDate(b.workDate || b.date)?.getTime() || 0;
    return aDate - bDate;
  });
}

function sumPairs(rows) {
  return rows.reduce(
    (acc, row) => {
      acc.target += num(row.target);
      acc.actual += num(row.actual);
      return acc;
    },
    { target: 0, actual: 0 },
  );
}

function siteCard(name, target, actual) {
  const pct = target ? (actual / target) * 100 : 0;
  const variance = actual - target;
  return {
    name,
    mtdTarget: target,
    mtdActual: actual,
    pct,
    note: !target && !actual
      ? "No production captured this month."
      : !target
        ? "Production captured without a target. Enter the target to measure achievement."
        : variance === 0
          ? "Captured production is on target."
          : `${Math.abs(variance).toLocaleString("en-ZA")} t ${variance > 0 ? "above" : "below"} the captured month-to-date target.`,
  };
}

function buildSummary(daily, asOf = new Date()) {
  const tracked = daily.filter((row) => isTrackedSite(row.site));
  const monthRows = tracked.filter((row) => sameMonth(row.workDate || row.date, asOf) && parseDate(row.workDate || row.date) <= asOf);
  const todayRows = monthRows.filter((row) => sameDay(row.workDate || row.date, asOf));
  const today = sumPairs(todayRows);
  const month = sumPairs(monthRows);
  const ggMonth = sumPairs(monthRows.filter((row) => normalizeSite(row.site) === "GG"));
  const medMonth = sumPairs(monthRows.filter((row) => normalizeSite(row.site) === "Medupi"));

  const dailyTarget = today.target;
  const dailyActual = today.actual;
  const mtdTarget = month.target;
  const mtdActual = month.actual;
  const gg = siteCard(
    "Grootegeluk",
    ggMonth.target,
    ggMonth.actual,
  );
  const medupi = siteCard(
    "Medupi",
    medMonth.target,
    medMonth.actual,
  );

  return {
    asOf: formatDmy(asOf),
    dailyTarget,
    dailyActual,
    mtdTarget,
    mtdActual,
    gg,
    medupi,
  };
}

function persistPayload(input, previous = {}) {
  validateInput("production_shifts", input);
  const workDate = isoDate(input.date ?? input.work_date ?? input.workDate ?? previous.workDate ?? previous.date, "Shift date");
  if (!workDate) {
    const err = new Error("Enter a valid shift date.");
    err.status = 400;
    throw err;
  }
  const target = num(input.target ?? previous.target);
  const actual = num(input.actual ?? previous.actual);
  if (target < 0 || actual < 0) {
    const err = new Error("Target and actual must be zero or more.");
    err.status = 400;
    throw err;
  }
  return {
    work_date: workDate,
    site: normalizeSite(input.site || previous.site || "GG"),
    shift: String(input.shift || previous.shift || "Day Shift").trim(),
    target,
    actual,
    challenges: String(input.challenges || previous.challenges || "No major note captured").trim(),
  };
}

function demoRow(payload, id) {
  return {
    id,
    date: formatDmy(payload.work_date),
    workDate: payload.work_date,
    site: payload.site,
    shift: payload.shift,
    target: payload.target,
    actual: payload.actual,
    challenges: payload.challenges,
  };
}

async function readDaily() {
  const rows = await readTable("production_shifts", catalog.productionDaily);
  return sortDaily(rows.map(toDailyRow));
}

async function readHours() {
  const rows = await readTable("machine_hours", catalog.machineHoursBlf);
  return rows.map(toHourRow);
}

function hourPersistPayload(input, previous = {}) {
  validateInput("machine_hours", input);
  const machine = machineReference(input.machine ?? previous.machine);
  if (!machine) {
    const err = new Error("Enter a machine or fleet number.");
    err.status = 400;
    throw err;
  }
  return {
    machine,
    work_date: isoDate(input.date ?? input.work_date ?? previous.date, "Capture date", { required: false }),
    equipment: String(input.equipment ?? previous.equipment ?? "").trim(),
    site: String(input.site || previous.site || "Belfast").trim(),
    hours: num(input.hours ?? previous.hours),
    downtime: num(input.downtime ?? previous.downtime),
    standby: num(input.standby ?? previous.standby),
    pm: num(input.pm ?? previous.pm),
    status: String(input.status || previous.status || "Operational").trim(),
    remarks: String(input.remarks ?? previous.remarks ?? "").trim(),
  };
}

export async function getBoard() {
  const [daily, machineHoursBlf, ggTotals, forecasts] = await Promise.all([readDaily(), readHours(), ggDaily.list(), forecastDaily.list()]);
  // A daily GG total represents all shifts on that date. Override those shifts
  // in KPI calculations to avoid counting the same production twice.
  const ggDates = new Set(ggTotals.map((row) => formatIso(row.date)));
  const shiftTargets = new Map();
  for (const row of daily.filter((row) => normalizeSite(row.site) === "GG")) {
    const date = formatIso(row.workDate || row.date);
    shiftTargets.set(date, (shiftTargets.get(date) || 0) + num(row.target));
  }
  const forecastTargets = new Map(forecasts.map((row) => [formatIso(row.date), num(row.total)]));
  const summaryRows = [
    ...daily.filter((row) => normalizeSite(row.site) !== "GG" || !ggDates.has(formatIso(row.workDate || row.date))),
    ...ggTotals.map((row) => ({
      ...row, site: "GG", workDate: row.date,
      target: num(row.target) || shiftTargets.get(formatIso(row.date)) || forecastTargets.get(formatIso(row.date)) || 0,
    })),
  ];
  return {
    summary: buildSummary(summaryRows),
    daily,
    machineHoursBlf,
  };
}

export async function captureShift(body) {
  const payload = persistPayload(body);
  const saved = await insertRow("production_shifts", payload, catalog.productionDaily);
  const row = toDailyRow({ ...demoRow(payload, saved.id), ...saved });
  if (!saved.date) Object.assign(saved, row);
  return row;
}

export async function updateShift(id, body) {
  const daily = await readDaily();
  const previous = daily.find((row) => row.id === id);
  if (!previous) {
    const err = new Error("Shift not found");
    err.status = 404;
    throw err;
  }
  const payload = persistPayload(body, previous);
  const saved = await updateRow("production_shifts", id, payload, catalog.productionDaily);
  const row = toDailyRow({ ...previous, ...demoRow(payload, id), ...saved, id });
  Object.assign(saved, { date: row.date, workDate: row.workDate, site: row.site });
  return row;
}

export async function removeShift(id) {
  await deleteRow("production_shifts", id, catalog.productionDaily);
  return { ok: true };
}

export async function captureHour(body) {
  const payload = hourPersistPayload(body);
  const saved = await insertRow("machine_hours", payload, catalog.machineHoursBlf);
  return toHourRow({ ...payload, ...saved });
}

export async function updateHour(id, body) {
  const hours = await readHours();
  const previous = hours.find((row) => row.id === id);
  if (!previous) {
    const err = new Error("Machine hours record not found");
    err.status = 404;
    throw err;
  }
  const payload = hourPersistPayload(body, previous);
  const saved = await updateRow("machine_hours", id, payload, catalog.machineHoursBlf);
  return toHourRow({ ...previous, ...payload, ...saved, id });
}

export async function removeHour(id) {
  await deleteRow("machine_hours", id, catalog.machineHoursBlf);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Static/historical registers migrated off local component state
// ---------------------------------------------------------------------------

const FORECAST_PARTS = ["productLoading", "sscc", "pci", "gg78", "snSs2", "pscBf", "buffaloFeeder", "screening"];
const FORECAST_COLS = { productLoading: "product_loading", sscc: "sscc", pci: "pci", gg78: "gg78", snSs2: "sn_ss2", pscBf: "psc_bf", buffaloFeeder: "buffalo_feeder", screening: "screening" };

function forecastDailyRow(row) {
  const out = { id: row.id, date: row.work_date };
  let total = 0;
  FORECAST_PARTS.forEach((key) => {
    const value = cnum(row[FORECAST_COLS[key]]);
    out[key] = value;
    total += value;
  });
  out.total = row.total != null ? cnum(row.total) : total;
  return out;
}
function forecastDailyPayload(input, previous = {}) {
  const workDate = isoDate(input.date ?? input.work_date ?? previous.date, "Forecast date");
  if (!workDate) {
    const err = new Error("Enter a date.");
    err.status = 400;
    throw err;
  }
  const payload = { work_date: workDate };
  let total = 0;
  FORECAST_PARTS.forEach((key) => {
    const value = cnum(input[key] ?? previous[key]);
    payload[FORECAST_COLS[key]] = value;
    total += value;
  });
  payload.total = total;
  return payload;
}
export const forecastDaily = makeCollection("production_forecast_daily", ref.productionForecastDaily, { toRow: forecastDailyRow, toPayload: forecastDailyPayload, uniqueBy: ["work_date"] });

function forecastWeekRow(row) {
  return {
    id: row.id,
    week: row.week,
    productLoading: row.product_loading,
    sscc: row.sscc,
    pci: row.pci,
    snSs2: row.sn_ss2,
    pscBf: row.psc_bf,
    buffaloFeeder: row.buffalo_feeder,
    screening: row.screening,
    total: row.total,
  };
}
export const forecastWeek = makeCollection("production_forecast_week", ref.productionForecastWeek, { toRow: forecastWeekRow });

function blfDailyRow(row) {
  return {
    id: row.id,
    date: row.work_date,
    machine: row.machine,
    equipment: row.equipment || "",
    opening: row.opening,
    closing: row.closing,
    total: row.total,
    downtime: row.downtime,
    standby: row.standby,
    pm: row.pm,
    notes: row.notes,
  };
}
function blfDailyPayload(input, previous = {}) {
  const machine = machineReference(input.machine ?? previous.machine);
  if (!machine) {
    const err = new Error("Enter a machine.");
    err.status = 400;
    throw err;
  }
  const opening = numberValue(input.opening ?? previous.opening, "Opening hours");
  const closing = numberValue(input.closing ?? previous.closing, "Closing hours");
  if (closing < opening) throw invalid("Closing hours must be greater than or equal to opening hours.");
  return {
    work_date: isoDate(input.date ?? input.work_date ?? previous.date, "Capture date"),
    machine,
    equipment: optStr(input.equipment, previous.equipment),
    opening,
    closing,
    total: closing - opening,
    downtime: cnum(input.downtime ?? previous.downtime),
    standby: cnum(input.standby ?? previous.standby),
    pm: cnum(input.pm ?? previous.pm),
    notes: optStr(input.notes, previous.notes),
  };
}
export const blfDaily = makeCollection("production_blf_daily", ref.productionBlfDaily, { toRow: blfDailyRow, toPayload: blfDailyPayload, uniqueBy: ["work_date", "machine"] });

function ggHoursRow(row) {
  return { id: row.id, machine: row.machine, total: row.total, downtime: row.downtime, standby: row.standby, pm: row.pm, status: row.status };
}
export const ggHours = makeCollection("production_gg_hours", ref.productionGgHours, { toRow: ggHoursRow });
