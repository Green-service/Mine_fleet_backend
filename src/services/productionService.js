import * as catalog from "../data/catalog.js";
import { deleteRow, insertRow, readTable, updateRow } from "./store.js";

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

function siteCard(name, target, actual, behindNote, aheadNote) {
  const pct = target ? (actual / target) * 100 : 0;
  return {
    name,
    mtdTarget: target,
    mtdActual: actual,
    pct,
    note: !target && !actual ? "No shifts captured this month." : pct >= 100 ? aheadNote : behindNote,
  };
}

function buildSummary(daily, asOf = new Date()) {
  const tracked = daily.filter((row) => isTrackedSite(row.site));
  const monthRows = tracked.filter((row) => sameMonth(row.workDate || row.date, asOf));
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
    "Grootegeluk is behind plan — check loader and ADT hours.",
    "Carrying group tonnes while Medupi recovers hours.",
  );
  const medupi = siteCard(
    "Medupi",
    medMonth.target,
    medMonth.actual,
    "Unsafe-condition stoppages earlier in the month still show in the MTD gap.",
    "Medupi is back on plan for the month.",
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
  const workDate = formatIso(input.date || input.work_date || input.workDate || previous.workDate || previous.date || new Date());
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

export async function getBoard() {
  const [daily, machineHoursBlf] = await Promise.all([readDaily(), readHours()]);
  return {
    summary: buildSummary(daily),
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
