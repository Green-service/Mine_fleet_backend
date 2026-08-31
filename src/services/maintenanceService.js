import * as catalog from "../data/catalog.js";
import { deleteRow, insertRow, readTable, updateRow } from "./store.js";
import { getAssets } from "./assetsService.js";
import { notifyAllUsers, recordSystemEvent } from "./notifications.js";
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

function formatDmyLong(value) {
  const date = parseDate(value);
  if (!date) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function addDays(base, days) {
  const date = parseDate(base) || new Date();
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
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
    machine: String(row.machine || row.asset_code || "").trim().toUpperCase(),
    task: row.task || "",
    spares: row.spares || "—",
    po: row.po || "—",
    status: row.status || "Planned",
  };
}

function persistOrder(input, previous = {}) {
  const machine = String(input.machine || input.assetCode || previous.machine || "").trim().toUpperCase();
  const task = String(input.task || previous.task || "").trim();
  if (!machine) {
    const err = new Error("Asset registration is required.");
    err.status = 400;
    throw err;
  }
  if (!task) {
    const err = new Error("Describe the service work.");
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

function buildServiceSchedule(assets) {
  return assets.map((asset) => ({
    id: asset.id,
    assetCode: asset.assetCode,
    makeModel: asset.makeModel,
    assetPhoto: asset.photos?.[0] || null,
    kind: asset.kind,
    driver: asset.assignedDriver,
    odometerKm: asset.odometerKm,
    odometerLabel: asset.odometerLabel,
    nextServiceKm: asset.nextServiceKm,
    nextServiceDate: asset.nextServiceDate,
    kmLeft: asset.kmLeft,
    status: asset.serviceStatus,
    business: asset.business,
    notes:
      asset.serviceStatus === "Overdue"
        ? "Service overdue — book workshop slot."
        : asset.serviceStatus === "Due Soon"
          ? "Due within 1 500 km or two weeks."
          : "On schedule.",
  }));
}

function buildAttention(assets) {
  return assets
    .filter((asset) => ["Due Soon", "Overdue"].includes(asset.serviceStatus))
    .map((asset) => ({
      id: asset.id,
      fleetNo: asset.assetCode,
      machine: asset.makeModel,
      assetPhoto: asset.photos?.[0] || null,
      status: asset.serviceStatus,
      reason: asset.serviceStatus === "Overdue" ? "Service date or km exceeded" : `${asset.kmLeft.toLocaleString("en-ZA")} km to next service`,
    }));
}

export async function getMaintenance() {
  const [{ assets }, workOrders] = await Promise.all([getAssets(), readOrders()]);
  const vehicles = assets.filter((row) => row.kind !== "property");
  const servicePlan = buildServiceSchedule(vehicles);
  const attention = buildAttention(vehicles);
  const overdue = servicePlan.filter((row) => row.status === "Overdue").length;
  const dueSoon = servicePlan.filter((row) => row.status === "Due Soon").length;
  const openOrders = workOrders.filter((row) => row.status !== "Closed").length;

  return {
    workOrders,
    attention,
    servicePlan,
    kpis: {
      inPlan: vehicles.filter((row) => row.status === "Active").length,
      overdue,
      dueSoon,
      openOrders,
      availability: vehicles.length
        ? Number((((vehicles.length - vehicles.filter((row) => row.status === "Workshop").length) / vehicles.length) * 100).toFixed(0))
        : 0,
    },
  };
}

export async function bookService(body, actor = null) {
  const [{ assets }] = await Promise.all([getAssets()]);
  const assetId = String(body.assetId || body.asset_id || "").trim();
  const vehicle = assets.find((row) => row.id === assetId && row.kind !== "property");
  if (!vehicle) {
    const err = new Error("Vehicle not found on the service plan.");
    err.status = 404;
    throw err;
  }

  const dueDate = parseDate(body.date) || addDays(new Date(), 10);
  const daysUntil = Math.max(
    1,
    Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  );
  const task = String(body.task || "Scheduled service").trim() || "Scheduled service";
  const workshop = String(body.workshop || body.spares || "Workshop TBC").trim() || "Workshop TBC";
  const payload = persistOrder({
    date: dueDate,
    machine: vehicle.assetCode,
    task,
    spares: workshop,
    po: "—",
    status: "Planned",
  });
  const saved = await insertRow("work_orders", payload, catalog.workOrders);
  const row = toWorkOrder({ ...payload, date: payload.work_date, ...saved });

  const vehicleLabel = `${vehicle.assetCode} · ${vehicle.makeModel}`;
  const dueLabel = formatDmyLong(dueDate);
  const bookedBy = actor?.name || "A team member";
  await notifyAllUsers({
    subject: `Service due — ${vehicle.assetCode}`,
    message: [
      `Service booked for ${vehicleLabel}.`,
      `This vehicle is due for service in ${daysUntil} day${daysUntil === 1 ? "" : "s"} — target date ${dueLabel}.`,
      `Work: ${task}`,
      `Workshop: ${workshop}`,
      `Booked by ${bookedBy}.`,
      "Open Maintenance in MPG Operations to view the schedule.",
    ].join("\n\n"),
  });

  return { ...row, vehicleLabel, dueDate: formatDmyLong(dueDate), emailsSent: true };
}

export async function createWorkOrder(body, actor = null) {
  const payload = persistOrder(body);
  const saved = await insertRow("work_orders", payload, catalog.workOrders);
  const row = toWorkOrder({ ...payload, date: payload.work_date, ...saved });
  if (!saved.date) Object.assign(saved, row);
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
  const row = toWorkOrder({ ...previous, ...payload, date: payload.work_date, ...saved, id });
  Object.assign(saved, row);
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
