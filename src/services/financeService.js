import * as catalog from "../data/catalog.js";
import * as ref from "../data/referenceCatalog.js";
import { readTable } from "./store.js";
import { makeCollection, optStr, str } from "./collectionService.js";

function num(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function compactMoney(value) {
  const n = num(value);
  if (!n) return "R 0";
  if (n >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  if (n >= 1_000) return `R${Math.round(n / 1000)}k`;
  return `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function toMachine(row, index) {
  return {
    id: row.id,
    rank: row.rank || index + 1,
    machine: row.machine || "",
    driver: row.driver || "",
    total: num(row.total),
  };
}

function buildKpis(machines) {
  const total = machines.reduce((sum, row) => sum + row.total, 0);
  return {
    monthlyMachine: compactMoney(total),
    diesel: compactMoney(0),
    repairs: compactMoney(0),
    invoices: compactMoney(0),
    total,
  };
}

async function readMachines() {
  const rows = await readTable("machine_costs", catalog.machineCosts);
  return rows
    .map(toMachine)
    .sort((a, b) => b.total - a.total)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export async function getFinance() {
  const machines = await readMachines();
  const top = machines[0];
  return {
    machines,
    kpis: buildKpis(machines),
    subtitle: top
      ? `${top.machine} is the dearest unit this month — ${top.driver.toLowerCase()}.`
      : "Capture machine costs to populate the monthly register.",
  };
}

// ---------------------------------------------------------------------------
// Static/historical registers migrated off local component state
// ---------------------------------------------------------------------------

function costActionRow(row) {
  return { id: row.id, action: row.action, owner: row.owner, priority: row.priority, due: row.due_label, status: row.status, evidence: row.evidence };
}
function costActionPayload(input, previous = {}) {
  const action = str(input.action, previous.action);
  const owner = str(input.owner, previous.owner);
  if (!action || !owner) {
    const err = new Error("Enter an action and owner.");
    err.status = 400;
    throw err;
  }
  return {
    action, owner,
    priority: optStr(input.priority, previous.priority) || "Medium",
    due_label: optStr(input.due, previous.due),
    status: optStr(input.status, previous.status) || "Open",
    evidence: optStr(input.evidence, previous.evidence),
  };
}
export const costActions = makeCollection("finance_cost_actions", ref.financeCostActions, { toRow: costActionRow, toPayload: costActionPayload });
