import * as catalog from "../data/catalog.js";
import { deleteRow, insertRow, readTable, updateRow } from "./store.js";
import { recordSystemEvent } from "./notifications.js";

function num(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toWorkOrder(row) {
  return {
    id: row.id,
    date: row.work_date || row.date || "",
    machine: row.machine || "",
    task: row.task || "",
    spares: row.spares || "—",
    po: row.po || "—",
    status: row.status || "Planned",
  };
}

function toAttentionMachine(row) {
  return {
    id: row.id,
    fleetNo: row.fleet_no || row.fleetNo,
    machine: row.machine || "",
    status: row.status || "Maintenance",
    reason: row.reason || "",
  };
}

function toServicePlanRow(row) {
  return {
    id: row.id,
    fleetNo: row.fleet_no || row.fleetNo,
    make: row.make || "",
    hours: num(row.hours),
    next: num(row.next_service ?? row.next),
    left: num(row.hours_left ?? row.left),
    date: row.due_date || row.date || "TBC",
    status: row.status || "Plan Service",
    notes: row.notes || "",
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
    const err = new Error("Describe the service work.");
    err.status = 400;
    throw err;
  }
  return {
    work_date: String(input.date || previous.date || new Date().toISOString().slice(0, 10)),
    machine,
    task,
    spares: String(input.spares ?? previous.spares ?? "—").trim() || "—",
    po: String(input.po ?? previous.po ?? "—").trim() || "—",
    status: String(input.status || previous.status || "Planned").trim(),
  };
}

async function readOrders() {
  const rows = await readTable("work_orders", catalog.workOrders);
  return rows.map(toWorkOrder);
}

export async function getMaintenance() {
  const [workOrders, attentionRows, planRows] = await Promise.all([
    readOrders(),
    readTable("attention_machines", catalog.attentionMachines),
    readTable("service_plans", catalog.servicePlan),
  ]);

  const attention = attentionRows.map(toAttentionMachine);
  const servicePlan = planRows.map(toServicePlanRow);
  const overdue = servicePlan.filter((row) => row.status === "Overdue").length;
  const dueSoon = servicePlan.filter((row) => row.status === "Due Soon").length;
  const inPlan = servicePlan.length;
  const availability = attention.length + servicePlan.length
    ? Number((100 - (attention.filter((row) => row.status === "Breakdown").length / Math.max(inPlan, 1)) * 100).toFixed(0))
    : 100;

  return {
    workOrders,
    attention,
    servicePlan,
    kpis: { inPlan, overdue, dueSoon, availability },
  };
}

export async function createWorkOrder(body, actor = null) {
  const payload = persistOrder(body);
  const saved = await insertRow("work_orders", payload, catalog.workOrders);
  const row = toWorkOrder({ ...payload, ...saved });
  await recordSystemEvent({
    title: "Work order created",
    detail: `${row.machine} · ${row.task}`,
    kind: "maintenance",
    actor,
    action: "created a work order",
    ctaPath: "/maintenance",
  });
  return row;
}

export async function updateWorkOrder(id, body, actor = null) {
  const previous = (await readOrders()).find((row) => row.id === id);
  if (!previous) {
    const err = new Error("Work order not found");
    err.status = 404;
    throw err;
  }
  const payload = persistOrder(body, previous);
  const saved = await updateRow("work_orders", id, payload, catalog.workOrders);
  const row = toWorkOrder({ ...previous, ...payload, ...saved, id });
  await recordSystemEvent({
    title: "Work order updated",
    detail: `${row.machine} · ${row.status}`,
    kind: "maintenance",
    actor,
    action: "updated a work order",
    ctaPath: "/maintenance",
  });
  return row;
}

export async function removeWorkOrder(id, actor = null) {
  const previous = (await readOrders()).find((row) => row.id === id);
  await deleteRow("work_orders", id, catalog.workOrders);
  if (previous) {
    await recordSystemEvent({
      title: "Work order removed",
      detail: `${previous.machine} · ${previous.task}`,
      kind: "maintenance",
      actor,
      action: "removed a work order",
      ctaPath: "/maintenance",
    });
  }
  return { ok: true };
}
