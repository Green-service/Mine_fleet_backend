import * as catalog from "../data/catalog.js";
import { deleteRow, insertRow, readTable, updateRow } from "./store.js";

const COST_PER_LITRE = 31.65;

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
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function formatIso(value) {
  const date = parseDate(value) || new Date();
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function formatTime(value) {
  if (value) return String(value);
  return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function sameDay(value, asOf) {
  const date = parseDate(value);
  return Boolean(date && date.getFullYear() === asOf.getFullYear() && date.getMonth() === asOf.getMonth() && date.getDate() === asOf.getDate());
}

function sameMonth(value, asOf) {
  const date = parseDate(value);
  return Boolean(date && date.getFullYear() === asOf.getFullYear() && date.getMonth() === asOf.getMonth());
}

function statusFromRate(litres, hours) {
  if (!hours) return "Investigate";
  const rate = litres / hours;
  if (rate < 16) return "Efficient";
  if (rate < 20) return "Normal";
  if (rate < 24) return "High Usage";
  return "Investigate";
}

function toIssue(row) {
  const workDate = row.work_date || row.workDate || row.date || row.issued_at;
  return {
    id: row.id,
    date: formatDmy(workDate),
    workDate: formatIso(workDate),
    time: row.issue_time || row.time || "",
    site: row.site || "Grootegeluk",
    machine: String(row.machine || "").trim().toUpperCase(),
    operator: row.operator || "",
    opening: num(row.opening),
    closing: num(row.closing),
    litres: num(row.litres),
    approvedBy: row.approved_by || row.approvedBy || "Pending",
  };
}

function issueHours(row) {
  return row.closing > row.opening ? row.closing - row.opening : 0;
}

function rollupMachines(issues) {
  const groups = new Map();
  for (const issue of issues) {
    const key = issue.machine || "UNKNOWN";
    const current = groups.get(key) || {
      id: `mach-${key}`,
      machine: key,
      site: issue.site,
      litres: 0,
      hours: 0,
      costPerLitre: COST_PER_LITRE,
    };
    current.litres += issue.litres;
    current.hours += issueHours(issue);
    current.site = issue.site || current.site;
    groups.set(key, current);
  }
  return [...groups.values()]
    .map((row) => ({ ...row, status: statusFromRate(row.litres, row.hours) }))
    .sort((a, b) => b.litres - a.litres);
}

function buildAlerts(machines) {
  return machines
    .filter((row) => row.status === "Investigate" || row.status === "High Usage")
    .map((row, index) => ({
      id: `alert-${row.machine}-${index}`,
      tone: row.status === "Investigate" ? "Critical" : "Watch",
      text:
        row.hours > 0
          ? `${row.machine} · ${(row.litres / row.hours).toFixed(1)} L/hr — ${row.status.toLowerCase()}`
          : `${row.machine} · missing hour meter on the last issue`,
    }));
}

function buildKpis(issues, machines, asOf = new Date()) {
  const todayIssues = issues.filter((row) => sameDay(row.workDate || row.date, asOf));
  const monthIssues = issues.filter((row) => sameMonth(row.workDate || row.date, asOf));
  const issuedToday = todayIssues.reduce((sum, row) => sum + row.litres, 0);
  const monthLitres = monthIssues.reduce((sum, row) => sum + row.litres, 0);
  const totalLitres = machines.reduce((sum, row) => sum + row.litres, 0);
  const totalHours = machines.reduce((sum, row) => sum + row.hours, 0);
  const exceptions = machines.filter((row) => row.status === "Investigate" || row.status === "High Usage").length;
  return {
    issuedToday,
    costPerLitre: COST_PER_LITRE,
    exceptions,
    litresPerHour: totalHours ? Number((totalLitres / totalHours).toFixed(1)) : 0,
    fuelPerTonne: 0,
    monthlySpend: monthLitres * COST_PER_LITRE,
    mtdReceived: 0,
    mtdIssued: monthLitres,
    closingStock: 0,
    largestLoss: 0,
  };
}

function persistIssue(input, previous = {}) {
  const machine = String(input.machine || previous.machine || "").trim().toUpperCase();
  if (!machine) {
    const err = new Error("Fleet number is required.");
    err.status = 400;
    throw err;
  }
  const litres = num(input.litres ?? previous.litres);
  if (litres < 0) {
    const err = new Error("Litres must be zero or more.");
    err.status = 400;
    throw err;
  }
  return {
    work_date: formatIso(input.date || input.work_date || previous.workDate || previous.date || new Date()),
    issue_time: formatTime(input.time || previous.time),
    site: String(input.site || previous.site || "Grootegeluk").trim(),
    machine,
    operator: String(input.operator || previous.operator || "").trim(),
    opening: num(input.opening ?? previous.opening),
    closing: num(input.closing ?? previous.closing),
    litres,
    approved_by: input.approvedBy || previous.approvedBy || "Pending",
  };
}

async function readIssues() {
  const rows = await readTable("diesel_issues", catalog.dieselIssues);
  return rows.map(toIssue);
}

export async function getDiesel() {
  const issues = await readIssues();
  const byMachine = rollupMachines(issues);
  const alerts = buildAlerts(byMachine);
  return {
    kpis: buildKpis(issues, byMachine),
    byMachine,
    issues,
    alerts,
    recon: [],
  };
}

export async function captureIssue(body) {
  const payload = persistIssue(body);
  const saved = await insertRow("diesel_issues", payload, catalog.dieselIssues);
  const row = toIssue({ ...payload, date: payload.work_date, time: payload.issue_time, approvedBy: payload.approved_by, ...saved });
  if (!saved.date) Object.assign(saved, row);
  return row;
}

export async function updateIssue(id, body) {
  const previous = (await readIssues()).find((row) => row.id === id);
  if (!previous) {
    const err = new Error("Issue not found");
    err.status = 404;
    throw err;
  }
  const payload = persistIssue(body, previous);
  const saved = await updateRow("diesel_issues", id, payload, catalog.dieselIssues);
  const row = toIssue({ ...previous, ...payload, date: payload.work_date, time: payload.issue_time, approvedBy: payload.approved_by, ...saved, id });
  Object.assign(saved, row);
  return row;
}

export async function removeIssue(id) {
  await deleteRow("diesel_issues", id, catalog.dieselIssues);
  return { ok: true };
}
