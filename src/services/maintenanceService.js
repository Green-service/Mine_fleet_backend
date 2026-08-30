import * as catalog from "../data/catalog.js";
import { deleteRow, insertRow, readTable, updateRow } from "./store.js";

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
  const date = parseDate(value) || new Date();
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function toWorkOrder(row) {
  return {
    id: row.id,
    date: formatDmy(row.work_date || row.date) || formatDmy(new Date()),
    machine: String(row.machine || "").trim().toUpperCase(),
    task: row.task || "",
    spares: row.spares || "—",
    po: row.po || "—",
    status: row.status || "Planned",
  };
}

function persistOrder(input, previous = {}) {
  const machine = String(input.machine || previous.machine || "").trim().toUpperCase();
  const task = String(input.task || previous.task || "").trim();
  if (!machine) {
    const err = new Error("Fleet number is required.");
    err.status = 400;
    throw err;
  }
  if (!task) {
    const err = new Error("Describe the work.");
    err.status = 400;
    throw err;
  }
  return {
    work_date: formatIso(input.date || input.work_date || previous.date || new Date()),
    machine,
    task,
    spares: String(input.spares || previous.spares || "—").trim() || "—",
    po: String(input.po || previous.po || "—").trim() || "—",
    status: String(input.status || previous.status || "Planned").trim(),
  };
}

async function readOrders() {
  const rows = await readTable("work_orders", catalog.workOrders);
  return rows.map(toWorkOrder);
}

export async function getMaintenance() {
  const workOrders = await readOrders();
  const machines = new Set(workOrders.map((row) => row.machine));
  const overdue = workOrders.filter((row) => row.status === "Overdue").length;
  const open = workOrders.filter((row) => row.status !== "Closed").length;
  return {
    workOrders,
    attention: [],
    servicePlan: [],
    kpis: {
      inPlan: machines.size,
      overdue,
      dueSoon: 0,
      availability: workOrders.length ? Number((((open - overdue) / workOrders.length) * 100).toFixed(1)) : 0,
    },
  };
}

export async function createWorkOrder(body) {
  const payload = persistOrder(body);
  const saved = await insertRow("work_orders", payload, catalog.workOrders);
  const row = toWorkOrder({ ...payload, date: payload.work_date, ...saved });
  if (!saved.date) Object.assign(saved, row);
  return row;
}

export async function updateWorkOrder(id, body) {
  const previous = (await readOrders()).find((row) => row.id === id);
  if (!previous) {
    const err = new Error("Work order not found");
    err.status = 404;
    throw err;
  }
  const payload = persistOrder(body, previous);
  const saved = await updateRow("work_orders", id, payload, catalog.workOrders);
  const row = toWorkOrder({ ...previous, ...payload, date: payload.work_date, ...saved, id });
  Object.assign(saved, row);
  return row;
}

export async function removeWorkOrder(id) {
  await deleteRow("work_orders", id, catalog.workOrders);
  return { ok: true };
}
