import * as catalog from "../data/catalog.js";
import { recordSystemEvent } from "./notifications.js";
import { deleteRow, insertRow, readTable, updateRow } from "./store.js";

function num(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB");
}

function toOrder(row) {
  return {
    id: row.id,
    reference: row.reference || "",
    orderNo: row.order_no || row.orderNo || "",
    supplier: row.supplier || "",
    date: formatDate(row.order_date || row.date),
    delivery: formatDate(row.delivery_date || row.delivery),
    exclusive: num(row.exclusive),
    vat: num(row.vat),
    total: num(row.total),
    status: row.status || "Open",
    progress: row.progress || "Not captured",
  };
}

function toRequest(row) {
  return {
    id: row.id,
    request: row.request_no || row.request || "",
    department: row.department || "",
    machine: row.machine || "—",
    item: row.item || "",
    value: num(row.value),
    status: row.status || "Awaiting Approval",
  };
}

function buildKpis(orders, requests) {
  const openOrders = orders.filter((row) => row.status === "Open");
  const openValue = openOrders.reduce((sum, row) => sum + row.total, 0);
  const latestOrder = orders[0];
  return {
    openPos: openOrders.length,
    openValue,
    openRequests: requests.filter((row) => row.status !== "PO Issued").length,
    issuedThisMonth: requests.filter((row) => row.status === "PO Issued").length,
    updatedLabel: latestOrder?.date && latestOrder.date !== "—" ? `Updated ${latestOrder.date}` : "No POs captured",
  };
}

function buildControl(orders, requests) {
  const items = [
    ...orders
      .filter((row) => row.status === "Open")
      .map((row) => ({
        id: row.id,
        item: row.reference,
        detail: `${row.supplier} — delivery ${row.delivery}`,
        status: row.status,
      })),
    ...requests
      .filter((row) => row.status === "Awaiting Approval")
      .map((row) => ({
        id: row.id,
        item: row.request,
        detail: `${row.item}${row.machine && row.machine !== "—" ? ` — ${row.machine}` : ""}`,
        status: row.status,
      })),
  ];
  return items;
}

async function readOrders() {
  const rows = await readTable("purchase_orders", catalog.purchaseOrders);
  return rows.map(toOrder);
}

async function readRequests() {
  const rows = await readTable("purchase_requests", catalog.purchaseRequests);
  return rows.map(toRequest);
}

export async function getProcurement() {
  const orders = await readOrders();
  const requests = await readRequests();
  return {
    orders,
    requests,
    control: buildControl(orders, requests),
    kpis: buildKpis(orders, requests),
  };
}

export async function createRequest(body, actor = null) {
  const item = String(body.item || "").trim();
  if (!item) {
    const err = new Error("Item description is required.");
    err.status = 400;
    throw err;
  }
  const requestNo = `PR-2026-${String(80 + catalog.purchaseRequests.length).padStart(3, "0")}`;
  const payload = {
    request_no: requestNo,
    department: String(body.department || "Engineering").trim(),
    machine: String(body.machine || "—").trim(),
    item,
    value: num(body.value),
    status: "Awaiting Approval",
  };
  const saved = await insertRow("purchase_requests", payload, catalog.purchaseRequests);
  const row = toRequest({ ...payload, ...saved });
  Object.assign(saved, row);
  await recordSystemEvent({
    title: "Purchase request raised",
    detail: `${row.requestNo} · ${item}`,
    kind: "finance",
    actor,
    action: "raised a purchase request",
    ctaPath: "/procurement",
  });
  return row;
}

export async function updateRequest(id, body) {
  const rows = await readTable("purchase_requests", catalog.purchaseRequests);
  const previous = rows.find((row) => row.id === id);
  if (!previous) {
    const err = new Error("Record not found");
    err.status = 404;
    throw err;
  }
  const payload = {
    department: String(body.department ?? previous.department ?? "").trim(),
    machine: String(body.machine ?? previous.machine ?? "").trim(),
    item: String(body.item ?? previous.item ?? "").trim(),
    value: num(body.value ?? previous.value),
    status: String(body.status ?? previous.status ?? "Awaiting Approval").trim(),
  };
  if (!payload.item) {
    const err = new Error("Item description is required.");
    err.status = 400;
    throw err;
  }
  const saved = await updateRow("purchase_requests", id, payload, catalog.purchaseRequests);
  return toRequest({ ...previous, ...payload, ...saved, id });
}

export async function removeRequest(id) {
  await deleteRow("purchase_requests", id, catalog.purchaseRequests);
  return { ok: true };
}

// `previous` here is the raw DB row (not the toOrder()-shaped one) — same
// convention as makeCollection's update(), so date columns stay ISO instead
// of round-tripping through toOrder()'s display formatting.
function orderPayload(body, previous = {}) {
  const supplier = String(body.supplier ?? previous.supplier ?? "").trim();
  if (!supplier) {
    const err = new Error("Supplier is required.");
    err.status = 400;
    throw err;
  }
  const exclusive = num(body.exclusive ?? previous.exclusive);
  const vat = num(body.vat ?? previous.vat ?? Math.round(exclusive * 0.15 * 100) / 100);
  return {
    supplier,
    order_no: String(body.orderNo ?? previous.order_no ?? "").trim(),
    exclusive,
    vat,
    total: num(body.total ?? previous.total ?? exclusive + vat),
    status: String(body.status ?? previous.status ?? "Open").trim(),
    order_date: body.date ?? previous.order_date ?? null,
    delivery_date: body.delivery ?? previous.delivery_date ?? null,
    progress: String(body.progress ?? previous.progress ?? "Not captured").trim(),
  };
}

export async function createOrder(body, actor = null) {
  const payload = orderPayload(body);
  payload.reference = `PO-2026-${String(60 + catalog.purchaseOrders.length).padStart(3, "0")}`;
  if (!payload.order_date) payload.order_date = new Date().toISOString();
  const saved = await insertRow("purchase_orders", payload, catalog.purchaseOrders);
  const row = toOrder({ ...payload, ...saved });
  await recordSystemEvent({
    title: "Purchase order captured",
    detail: `${row.reference} · ${row.supplier}`,
    kind: "finance",
    actor,
    action: "captured a purchase order",
    ctaPath: "/procurement",
  });
  return row;
}

export async function updateOrder(id, body) {
  const rows = await readTable("purchase_orders", catalog.purchaseOrders);
  const previous = rows.find((row) => row.id === id);
  if (!previous) {
    const err = new Error("Record not found");
    err.status = 404;
    throw err;
  }
  const payload = orderPayload(body, previous);
  const saved = await updateRow("purchase_orders", id, payload, catalog.purchaseOrders);
  return toOrder({ ...previous, ...payload, ...saved, id });
}

export async function removeOrder(id) {
  await deleteRow("purchase_orders", id, catalog.purchaseOrders);
  return { ok: true };
}
