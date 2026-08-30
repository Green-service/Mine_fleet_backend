import * as catalog from "../data/catalog.js";
import { insertRow, readTable } from "./store.js";

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

export async function createRequest(body) {
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
  return row;
}
