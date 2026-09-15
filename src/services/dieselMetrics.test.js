import test from "node:test";
import assert from "node:assert/strict";
import { machineConsumption, consumptionByType, filterTransactions, operatorNames, reconciliationRow, transactionTotals } from "./dieselMetrics.js";

test("diesel summaries recalculate from transactions without double counting sites", () => {
  const transactions = [
    { machine: "CMPG044", site: "Grootegeluk", litres: 100, totalCost: 2200, opening: 1000, closing: 1100 },
    { machine: "CMPG044", site: "Grootegeluk", litres: 50, totalCost: 1150 },
    { machine: "CMPG044", site: "Belfast", litres: 70, totalCost: 1540 },
  ];
  const equipment = [{ fleet_no: "CMPG044", category: "Front-End Loader" }];
  const captures = [{ machine: "CMPG044", site: "GG", hours: 10 }];
  const rows = machineConsumption(transactions, equipment, captures);
  assert.equal(rows[0].litres, 150);
  assert.equal(rows[0].totalCost, "R3350.00");
  assert.equal(rows[0].lPerHr, 15);
  assert.equal(rows[1].hours, 0);
  assert.equal(rows[1].lPerHr, null);
  assert.equal(consumptionByType(rows)[0].litres, 220);
  assert.equal(machineConsumption(transactions.slice(1), equipment)[0].litres, 70);
  assert.deepEqual(machineConsumption([]), []);
});

test("operator and date filters include every matching machine and drive the same totals", () => {
  const captures = [
    { date: "2026-09-01", machine: "CMPG001", site: "Grootegeluk", operator: "T. Nkosi", litres: 100, totalCost: 2200 },
    { date: "2026-09-02", machine: "CMPG002", site: "Belfast", operator: " t.   nkosi ", litres: 50, totalCost: 1100 },
    { date: "2026-09-03", machine: "CMPG001", site: "Grootegeluk", operator: "J. Smith", litres: 25, totalCost: 600 },
    { date: "2026-08-31", machine: "CMPG003", site: "Grootegeluk", operator: "T. Nkosi", litres: 10, totalCost: 220 },
    { date: "2026-09-03", machine: "CMPG004", site: "Grootegeluk", operator: null, litres: 15, totalCost: 330 },
  ];
  const filters = { operator: "T. Nkosi", from: "2026-09-01", to: "2026-09-30" };
  const rows = filterTransactions(captures, filters);
  assert.deepEqual(rows.map((row) => row.machine), ["CMPG001", "CMPG002"]);
  assert.deepEqual(transactionTotals(rows), { litres: 150, cost: 3300, transactions: 2, machines: 2 });
  assert.equal(machineConsumption(rows).length, 2);
  assert.equal(filterTransactions(captures, { operator: "__unassigned" }).length, 1);
  assert.equal(filterTransactions(captures, { ...filters, q: "CMPG002" }).length, 1);
  assert.deepEqual(operatorNames(captures, [{ name: "S. Dube" }]), ["J. Smith", "S. Dube", "T. Nkosi"]);
  assert.equal(filterTransactions([{ date: "01 Sep 2026", workDate: "2026-09-01", operator: "T. Nkosi" }], filters).length, 1);
});

test("operator totals never borrow another driver's engine hours", () => {
  const transactions = [{ machine: "CMPG044", site: "Grootegeluk", operator: "T. Nkosi", litres: 100, totalCost: 2200 }];
  const unrelatedHours = [{ machine: "CMPG044", site: "GG", hours: 10 }];
  assert.equal(machineConsumption(transactions, [], unrelatedHours, { operator: "T. Nkosi" })[0].lPerHr, null);
  assert.equal(machineConsumption(transactions, [], [{ ...unrelatedHours[0], operator: "T. Nkosi" }], { operator: "T. Nkosi" })[0].lPerHr, 10);
});

test("reconciliation accepts numeric, formatted and missing legacy values without crashing", () => {
  assert.deepEqual(reconciliationRow({ id: "legacy", work_date: "12/09/2026", received: "1 200 L", issued: 1100, stock: null, variance: -5, status: null }), {
    id: "legacy", date: "2026-09-12", received: 1200, issued: 1100, stock: null, variance: -5, status: "Review",
  });
  const missing = reconciliationRow({ work_date: null, variance: null, received: "pending" });
  assert.equal(missing.date, "");
  assert.equal(missing.variance, null);
  assert.equal(missing.received, null);
});
