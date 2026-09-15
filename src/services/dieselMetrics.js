export function dieselNumber(value, fallback = 0) {
  if (value == null || String(value).trim() === "") return fallback;
  const text = String(value).trim().replace(/^R\s*/i, "").replace(/\s*L\s*$/i, "").replace(/[\s,]/g, "");
  const result = Number(text);
  return Number.isFinite(result) ? result : fallback;
}
const number = dieselNumber;
const key = (value) => String(value || "").trim().toUpperCase();
const siteKey = (value) => ({ GG: "GROOTEGELUK", GGC: "GROOTEGELUK", BLF: "BELFAST", HQ: "HEAD OFFICE" })[key(value)] || key(value);
export const operatorKey = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

export function dieselDate(value) {
  const text = String(value ?? "").trim();
  let parts = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(text)?.slice(1).map(Number);
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (dmy) parts = [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])];
  if (!parts) return "";
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1000 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function matchesPeriod(row, filters) {
  if (!filters.from && !filters.to) return true;
  const date = [row.work_date, row.workDate, row.date, row.period_start].map(dieselDate).find(Boolean);
  return Boolean(date) && (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to);
}

function matchesOperator(row, operator) {
  if (!operator) return true;
  const recorded = operatorKey(row.operator || row.driver);
  return operator === "__unassigned" ? !recorded : recorded === operatorKey(operator);
}

export function filterTransactions(rows = [], filters = {}) {
  const search = String(filters.q || "").trim().toLowerCase();
  return rows.filter((row) => row && matchesPeriod(row, filters) && matchesOperator(row, filters.operator)
    && (!filters.site || siteKey(row.site) === siteKey(filters.site))
    && (!filters.machine || key(row.machine) === key(filters.machine))
    && (!search || Object.values(row).some((value) => value != null && typeof value !== "object" && String(value).toLowerCase().includes(search))));
}

export function operatorNames(transactions = [], drivers = []) {
  const names = new Map();
  for (const row of [...transactions, ...drivers]) {
    const name = String(row?.operator || row?.driver || row?.name || row?.full_name || "").trim().replace(/\s+/g, " ");
    if (name && !names.has(operatorKey(name))) names.set(operatorKey(name), name);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

export function transactionTotals(rows = []) {
  return {
    litres: rows.reduce((sum, row) => sum + number(row.litres), 0),
    cost: rows.reduce((sum, row) => sum + number(row.totalCost ?? row.total_cost), 0),
    transactions: rows.length,
    machines: new Set(rows.map((row) => key(row.machine)).filter(Boolean)).size,
  };
}

export function reconciliationRow(row = {}) {
  return {
    id: row.id,
    date: dieselDate(row.work_date ?? row.date) || String(row.work_date ?? row.date ?? ""),
    received: dieselNumber(row.received, null),
    issued: dieselNumber(row.issued, null),
    stock: dieselNumber(row.stock, null),
    variance: dieselNumber(row.variance, null),
    status: String(row.status || "Review"),
  };
}

// Consumption totals come from pump transactions. Engine operating hours are
// separate captures; the pump opening/closing readings must never become hours.
export function machineConsumption(transactions, equipment = [], captures = [], filters = {}) {
  const fleet = new Map(equipment.map((row) => [key(row.fleet_no || row.fleetNo), row]));
  const hours = new Map();
  for (const row of captures) {
    if (!matchesPeriod(row, filters) || !matchesOperator(row, filters.operator)) continue;
    const machine = `${siteKey(row.site)}:${key(row.machine)}`;
    hours.set(machine, (hours.get(machine) || 0) + number(row.hours));
  }
  const groups = new Map();
  for (const row of transactions) {
    const machine = key(row.machine);
    const site = row.site || fleet.get(machine)?.site || "Unallocated";
    const groupKey = `${siteKey(site)}:${machine}`;
    const group = groups.get(groupKey) || { id: groupKey, machine, site, litres: 0, cost: 0, operatorNames: [], transactions: 0 };
    group.litres += number(row.litres);
    group.cost += number(row.totalCost ?? row.total_cost);
    group.transactions += 1;
    const operator = String(row.operator || row.driver || "").trim();
    if (operator && !group.operatorNames.some((name) => operatorKey(name) === operatorKey(operator))) group.operatorNames.push(operator);
    groups.set(groupKey, group);
  }
  return [...groups.values()].map((row) => {
    const operatingHours = hours.get(`${siteKey(row.site)}:${row.machine}`) || 0;
    return {
      ...row,
      operator: row.operatorNames.join(", ") || "Not recorded",
      type: fleet.get(row.machine)?.category || "Unclassified",
      costPerL: `R${(row.litres ? row.cost / row.litres : 0).toFixed(2)}`,
      totalCost: `R${row.cost.toFixed(2)}`,
      hours: operatingHours,
      lPerHr: operatingHours ? Number((row.litres / operatingHours).toFixed(1)) : null,
      status: operatingHours ? "Captured" : "Hours not captured",
    };
  }).sort((a, b) => b.litres - a.litres);
}

export function consumptionByType(machines) {
  const groups = new Map();
  for (const row of machines) groups.set(row.type, (groups.get(row.type) || 0) + row.litres);
  const total = machines.reduce((sum, row) => sum + row.litres, 0);
  return [...groups].map(([type, litres]) => ({
    id: type, type, litres, pct: total ? `${(litres / total * 100).toFixed(1)}%` : "0.0%",
  })).sort((a, b) => b.litres - a.litres);
}
