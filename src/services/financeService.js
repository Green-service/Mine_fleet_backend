import * as catalog from "../data/catalog.js";
import { readTable } from "./store.js";

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
