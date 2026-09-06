import * as catalog from "../data/catalog.js";
import { deleteRow, insertRow, readTable, updateRow } from "./store.js";
import { recordSystemEvent } from "./notifications.js";
import { getSettings } from "./settingsService.js";

function num(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isToday(dateStr) {
  if (!dateStr) return false;
  const today = new Date();
  const d = new Date(dateStr);
  return d.toDateString() === today.toDateString();
}

function isThisMonth(dateStr) {
  if (!dateStr) return false;
  const today = new Date();
  const d = new Date(dateStr);
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
}

function toIssue(row) {
  return {
    id: row.id,
    date: row.work_date || row.date || "",
    time: row.issue_time || row.time || "",
    site: row.site || "",
    machine: row.machine || "",
    operator: row.operator || "",
    opening: num(row.opening),
    closing: num(row.closing),
    litres: num(row.litres),
    approvedBy: row.approved_by || row.approvedBy || "Pending",
  };
}

function toByMachine(row) {
  return {
    machine: row.machine,
    site: row.site || "",
    litres: num(row.litres),
    costPerLitre: num(row.cost_per_litre ?? row.costPerLitre),
    hours: num(row.hours),
    status: row.status || "Normal",
  };
}

function toAlert(row) {
  return { tone: row.tone || "due", text: row.text || "" };
}

function toRecon(row) {
  return {
    date: row.work_date || row.date || "",
    received: num(row.received),
    issued: num(row.issued),
    stock: num(row.stock),
    variance: num(row.variance),
    status: row.status || "Acceptable",
  };
}

function persistIssue(input, previous = {}) {
  const machine = String(input.machine || previous.machine || "").trim().toUpperCase();
  if (!machine) {
    const err = new Error("Machine is required.");
    err.status = 400;
    throw err;
  }
  const now = new Date();
  return {
    work_date: String(input.date || previous.date || now.toISOString().slice(0, 10)),
    issue_time:
      previous.time ||
      now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    site: String(input.site || previous.site || "Grootegeluk").trim(),
    machine,
    operator: String(input.operator ?? previous.operator ?? "").trim(),
    opening: num(input.opening ?? previous.opening),
    closing: num(input.closing ?? previous.closing),
    litres: num(input.litres ?? previous.litres),
    approved_by: previous.approvedBy || "Pending",
  };
}

async function readIssues() {
  const rows = await readTable("diesel_issues", catalog.dieselIssues);
  return rows.map(toIssue).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export async function getDiesel() {
  const [issues, byMachineRows, alertRows, reconRows, settings] = await Promise.all([
    readIssues(),
    readTable("diesel_by_machine", catalog.dieselByMachine),
    readTable("diesel_alerts", catalog.dieselAlerts),
    readTable("diesel_reconciliations", catalog.dieselRecon),
    getSettings(),
  ]);

  const byMachine = byMachineRows.map(toByMachine);
  const alerts = alertRows.map(toAlert);
  const recon = reconRows
    .map(toRecon)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const issuedToday = issues.filter((row) => isToday(row.date)).reduce((sum, row) => sum + row.litres, 0);
  const monthLitres = byMachine.reduce((sum, row) => sum + row.litres, 0);
  const monthHours = byMachine.reduce((sum, row) => sum + row.hours, 0);
  const machinesWithCost = byMachine.filter((row) => row.costPerLitre > 0);
  const costPerLitre = num(settings?.dieselCostPerLitre) || (
    machinesWithCost.length
      ? Number((machinesWithCost.reduce((sum, row) => sum + row.costPerLitre, 0) / machinesWithCost.length).toFixed(2))
      : 0
  );
  const monthlySpend = monthLitres * costPerLitre;
  const latestRecon = recon[recon.length - 1];
  const mtdReceived = recon.filter((row) => isThisMonth(row.date)).reduce((sum, row) => sum + row.received, 0);
  const mtdIssued = recon.filter((row) => isThisMonth(row.date)).reduce((sum, row) => sum + row.issued, 0);

  return {
    kpis: {
      issuedToday,
      costPerLitre,
      exceptions: alerts.length,
      litresPerHour: monthHours ? Number((monthLitres / monthHours).toFixed(1)) : 0,
      fuelPerTonne: 0,
      monthlySpend: monthlySpend
        ? `R${(monthlySpend / 1_000_000).toFixed(2)}m`
        : "R 0",
      mtdReceived,
      mtdIssued,
      closingStock: latestRecon ? latestRecon.stock : 0,
    },
    byMachine,
    issues,
    alerts,
    recon,
  };
}

export async function captureIssue(body, actor = null) {
  const payload = persistIssue(body);
  const saved = await insertRow("diesel_issues", payload, catalog.dieselIssues);
  const row = toIssue({ ...payload, ...saved });
  await recordSystemEvent({
    title: "Diesel issue captured",
    detail: `${row.machine} · ${row.litres} L`,
    kind: "diesel",
    actor,
    action: "captured a diesel issue",
    ctaPath: "/diesel",
  });
  return row;
}

export async function updateIssue(id, body, actor = null) {
  const previous = (await readIssues()).find((row) => row.id === id);
  if (!previous) {
    const err = new Error("Diesel issue not found");
    err.status = 404;
    throw err;
  }
  const payload = persistIssue(body, previous);
  const saved = await updateRow("diesel_issues", id, payload, catalog.dieselIssues);
  const row = toIssue({ ...previous, ...payload, ...saved, id });
  await recordSystemEvent({
    title: "Diesel issue updated",
    detail: `${row.machine} · ${row.litres} L`,
    kind: "diesel",
    actor,
    action: "updated a diesel issue",
    ctaPath: "/diesel",
  });
  return row;
}

export async function removeIssue(id, actor = null) {
  const previous = (await readIssues()).find((row) => row.id === id);
  await deleteRow("diesel_issues", id, catalog.dieselIssues);
  if (previous) {
    await recordSystemEvent({
      title: "Diesel issue removed",
      detail: `${previous.machine} · ${previous.litres} L`,
      kind: "diesel",
      actor,
      action: "removed a diesel issue",
      ctaPath: "/diesel",
    });
  }
  return { ok: true };
}
