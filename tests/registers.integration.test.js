import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";

// Exercise the real routes/services without touching configured Supabase or
// the developer's saved demo registers. dotenv does not replace defined keys.
for (const key of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) process.env[key] = "";
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "mpg-register-test-"));
process.env.MPG_RUNTIME_DIR = runtime;
const { router } = await import("../src/routes/index.js");
let server, base;
before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  const resolved = path.resolve(runtime);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith("mpg-register-test-"));
  fs.rmSync(resolved, { recursive: true, force: true });
});

async function request(url, method = "GET", body) {
  const response = await fetch(`${base}${url}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}

test("department action trackers keep HR, Finance and Safety records separate and reject invalid input", async () => {
  const safetyBefore = (await request("/safety/individual")).data;
  const input = { person: "Shared owner", action: "Department action", start: "2091-01-01", due: "2091-01-31", status: "Scheduled" };
  const hr = await request("/hr/action-tracker", "POST", input);
  const finance = await request("/finance/action-tracker", "POST", input);
  assert.equal(hr.status, 201);
  assert.equal(finance.status, 201);
  assert.match(hr.data.ref, /^HR-/);
  assert.match(finance.data.ref, /^FIN-/);
  assert.notEqual(hr.data.ref, finance.data.ref);
  assert.equal((await request(`/finance/action-tracker/${hr.data.id}`, "PATCH", { status: "Completed" })).status, 404);
  assert.equal((await request(`/hr/action-tracker/${finance.data.id}`, "DELETE")).status, 404);
  assert.equal((await request("/hr/action-tracker")).data.find((row) => row.id === hr.data.id).status, "Scheduled");
  for (const endpoint of ["/hr/action-tracker", "/finance/action-tracker"]) {
    const before = (await request(endpoint)).data;
    for (const values of [{ person: "" }, { action: "" }, { status: "Unknown" }, { due: "2090-12-31" }, { start: "2091-02-30" }]) {
      assert.equal((await request(endpoint, "POST", { ...input, ...values })).status, 400);
    }
    assert.deepEqual((await request(endpoint)).data, before);
    const saved = endpoint.includes("/hr/") ? hr.data : finance.data;
    assert.equal((await request(`${endpoint}/${saved.id}`, "PATCH", { ref: "REPLACED", action: "Updated action" })).status, 200);
    const reread = (await request(endpoint)).data.find((row) => row.id === saved.id);
    assert.equal(reread.ref, saved.ref);
    assert.equal(reread.person, input.person);
    assert.equal((await request(`${endpoint}/${saved.id}`, "DELETE")).status, 200);
  }
  assert.deepEqual((await request("/safety/individual")).data, safetyBefore);
});

// [endpoint, create payload, patch, field that must survive a partial edit,
//  optional list endpoint / property for dashboard-backed registers]
const fixtures = [
  ["/hr/action-tracker", { person: "HR Test Owner", action: "Verify training records", source: "Internal audit", section: "HR", category: "Training", start: "2091-01-01", due: "2091-01-31", status: "Scheduled" }, { status: "In Progress" }, "ref"],
  ["/finance/action-tracker", { person: "Finance Test Owner", action: "Reconcile supplier invoices", source: "Month-end review", section: "Finance", category: "Reconciliation", start: "2091-01-01", due: "2091-01-31", status: "Scheduled" }, { status: "Completed" }, "ref"],
  ["/production/gg-daily", { date: "2091-01-10", target: 2000, actual: 2200 }, { actual: 2300 }, "target"],
  ["/production/forecast-daily", { date: "2091-01-11", productLoading: 100, sscc: 200, gg78: 30 }, { pci: 50 }, "productLoading"],
  ["/production/blf-daily", { date: "2091-01-12", machine: "CMPG-TEST-BLF", opening: 1200, closing: 1210, downtime: 2 }, { closing: 1212 }, "opening"],
  ["/production", { date: "2091-01-13", site: "Medupi", shift: "Day Shift", target: 120, actual: 100 }, { actual: 110 }, "target", "/production", "daily"],
  ["/production/hours", { machine: "CMPG-TEST-HOURS", equipment: "Loader", site: "Grootegeluk", hours: 10, downtime: 2 }, { hours: 11 }, "equipment", "/production", "machineHoursBlf"],
  ["/fleet", { fleetNo: "CMPG-TEST-FLEET", equipment: "CAT 966", category: "Front-End Loader", site: "Head Office", hours: 100, health: 80 }, { status: "Maintenance" }, "equipment", "/fleet", "equipment"],
  ["/diesel/transactions", { date: "2091-01-14", time: "08:30", site: "Grootegeluk", machine: "CMPG-TEST-DIESEL", opening: 1000, closing: 1100, litres: 100, totalCost: 2200, operator: "Test Operator", approvedBy: "Supervisor" }, { totalCost: 2300 }, "approvedBy"],
  ["/diesel/daily-reconciliation", { date: "2091-01-14", received: 200, issued: 100, stock: 100, variance: -2 }, { stock: 98 }, "issued"],
  ["/maintenance/full-register", { fleetNo: "CMPG-TEST-MAINT", machine: "CAT FEL", status: "Maintenance", reason: "Service" }, { reason: "Awaiting filters" }, "fleetNo"],
  ["/maintenance/backlog", { site: "Belfast", fleet: "CMPG-TEST-BACKLOG", defect: "Hydraulic leak", start: "2091-01-15", orderNo: "PO-TEST" }, { risk: "High" }, "orderNo"],
  ["/maintenance/service-plan-static", { fleetNo: "CMPG-TEST-PLAN", make: "CAT", model: "966", hours: 950, nextService: 1000, planned: "2091-01-16" }, { hours: 1010 }, "nextService"],
  ["/maintenance", { machine: "CMPG-TEST-WORK", task: "Replace filter", date: "2091-01-17" }, { status: "Completed" }, "task", "/maintenance", "workOrders"],
  ["/breakdowns", { machine: "CMPG-TEST-BREAK", failure: "Pump failure", site: "Belfast", severity: "Major", downtime: "2 hrs" }, { status: "Closed" }, "failure", "/breakdowns", "items"],
  ["/breakdowns/inventory", { site: "Belfast", desc: "Hydraulic filter", part: "TEST-PART", qty: "2", supplier: "Test Parts Supplier", status: "In Stock" }, { qty: "3" }, "supplier"],
  ["/breakdowns/availability", { plant: "CMPG-TEST-AVAIL", hoursWorked: 100, breakdownHours: 10, failures: 2 }, { hoursWorked: 110 }, "breakdownHours"],
  ["/safety", { description: "Guard rail inspection", source: "Near Miss", site: "Grootegeluk", severity: "High" }, { status: "Closed" }, "action", "/safety", "actions"],
  ["/safety/individual", { action: "Replace guard rail", person: "Test Foreman", due: "2091-01-20", section: "Plant" }, { status: "Completed" }, "section"],
  ["/safety/performance", { indicator: "PTO compliance", result: "95%", status: "On Target", comment: "Review" }, { result: "98%" }, "comment"],
  ["/hr/employees", { name: "Test Operator", number: "MPG-TEST", site: "Belfast", rate: 120 }, { title: "Supervisor" }, "number"],
  ["/hr/leave", { employee: "Test Operator", type: "Annual", from: "2091-01-20", to: "2091-01-22", days: 3 }, { status: "Approved" }, "from"],
  ["/hr/claims", { employee: "Test Operator", type: "Travel", amount: 120 }, { status: "Approved" }, "type"],
  ["/hr/manpower", { area: "Belfast", role: "Plant Operator", budget: 2, actual: 1 }, { actual: 2 }, "role"],
  ["/hr/recruitment", { site: "Belfast", position: "Plant Operator", name: "Test Candidate" }, { status: "Filled" }, "name"],
  ["/hr/increases", { employee: "Test Operator", employeeId: "MPG-TEST", date: "2091-01-22", pct: "5.5%", approvedBy: "HR" }, { reason: "Annual review" }, "employeeId"],
  ["/hr/promotions", { employee: "Test Operator", employeeId: "MPG-TEST", newTitle: "Supervisor", date: "2091-01-22" }, { approvedBy: "HR" }, "employeeId"],
  ["/hr/disciplinary", { employee: "Test Operator", date: "2091-01-22", reason: "Late arrival" }, { outcome: "Counselling" }, "date"],
  ["/hr/ccma", { referral: "Test Referral", date: "2091-01-22", site: "Belfast", reason: "Review" }, { stage: "Arbitration" }, "date"],
  ["/procurement/orders", { supplier: "Test Supplier", exclusive: 100, vat: 15, delivery: "2091-01-25" }, { progress: "Dispatched" }, "supplier", "/procurement", "orders"],
  ["/procurement/requests", { item: "Hydraulic filter", department: "Engineering", machine: "CMPG-TEST", value: 150 }, { status: "Approved" }, "item", "/procurement", "requests"],
  ["/finance", { machine: "CMPG-TEST-COST", driver: "Test Operator", total: 1500 }, { total: 1600 }, "driver", "/finance", "machines"],
  ["/finance/cost-actions", { action: "Review fuel variance", owner: "Finance", due: "This month", priority: "High" }, { status: "Completed" }, "due"],
];

for (const [endpoint, input, patch, preserved, listEndpoint = endpoint, listKey] of fixtures) {
  test(`${endpoint}: create → fresh read → partial update → delete`, async () => {
    const created = await request(endpoint, "POST", input);
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.ok(created.data.id, "created record has a persistent ID");
    const id = created.data.id;
    const list = async () => {
      const response = await request(listEndpoint);
      assert.equal(response.status, 200, JSON.stringify(response.data));
      return listKey ? response.data[listKey] : response.data;
    };
    assert.ok(Array.isArray(await list()), `Expected rows at ${listEndpoint}.${listKey || ""}`);
    const saved = (await list()).find((row) => row.id === id);
    assert.ok(saved, "save remains visible after a fresh GET");
    const updated = await request(`${endpoint}/${id}`, "PATCH", patch);
    assert.equal(updated.status, 200, JSON.stringify(updated.data));
    const reread = (await list()).find((row) => row.id === id);
    assert.equal(reread[preserved], saved[preserved], `${preserved} survives partial edit`);
    for (const key of Object.keys(patch)) {
      if (key in reread) assert.equal(String(reread[key]), String(patch[key]), `${key} saved`);
    }
    assert.equal((await request(`${endpoint}/${id}`, "DELETE")).status, 200);
    assert.ok(!(await list()).some((row) => row.id === id), "deleted row stays absent on reload");
    assert.equal((await request(`${endpoint}/${id}`, "DELETE")).status, 404, "missing deletes cannot report success");
  });
}

test("invalid dates, negative quantities and reversed meters fail before writes", async () => {
  for (const [endpoint, body] of [
    ["/production/gg-daily", { date: "2026-02-30", target: 100, actual: 100 }],
    ["/production/forecast-daily", { date: "2091-01-01", productLoading: "abc" }],
    ["/production/blf-daily", { date: "2091-01-01", machine: "TEST", opening: 10, closing: 9 }],
    ["/diesel/transactions", { date: "2091-01-01", machine: "TEST", site: "Grootegeluk", litres: -1 }],
    ["/diesel/transactions", { date: "2091-01-01", time: "25:00", machine: "TEST", site: "Grootegeluk", litres: 10 }],
    ["/hr/leave", { employee: "Test", from: "2091-01-03", to: "2091-01-02", days: 1 }],
    ["/finance", { machine: "TEST", total: "abc" }],
  ]) {
    const response = await request(endpoint, "POST", body);
    assert.equal(response.status, 400, `${endpoint}: ${JSON.stringify(response.data)}`);
  }
});

test("business → asset → driver → income/expense/fuel links survive reload and bin restore", async () => {
  const business = await request("/businesses", "POST", { name: "Test Operations", type: "Services", status: "Active" });
  assert.equal(business.status, 201, JSON.stringify(business.data));
  const asset = await request("/assets", "POST", {
    assetCode: "MPG-LINK-TEST", makeModel: "Toyota Hilux", kind: "vehicle", business: "Test Operations",
    type: "Bakkie", odometerKm: 10000, nextServiceKm: 15000, purchaseCost: 100000,
    photos: ["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII="],
  });
  assert.equal(asset.status, 201, JSON.stringify(asset.data));
  const assetId = asset.data.id;
  const driver = await request("/drivers", "POST", { name: "Test Driver", phone: "0825550123", licenseNo: "TEST1234", business: "Test Operations", assetId });
  assert.equal(driver.status, 201, JSON.stringify(driver.data));
  assert.equal((await request(`/assets/${assetId}`)).data.assignedDriverId, driver.data.id);
  assert.equal((await request(`/drivers/${driver.data.id}`, "PATCH", { phone: "0825550124" })).status, 200);

  const income = await request("/log", "POST", { assetId, periodStartIso: "2091-01-01", periodType: "monthly", income: 1000, deductions: 100 });
  assert.equal(income.status, 201, JSON.stringify(income.data));
  const expense = await request("/log", "POST", { assetId, entryType: "expense", category: "Repairs", periodStartIso: "2091-01-02", periodType: "once", amount: 200 });
  assert.equal(expense.status, 201, JSON.stringify(expense.data));
  const slip = { name: "fuel-slip.png", data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=" };
  const fillInput = { assetId, date: "2091-01-02", fuelType: "Diesel 50", litres: 50, odometerKm: 10500 };
  const countBefore = (await request("/diesel")).data.fills.length;
  assert.equal((await request("/diesel", "POST", { ...fillInput, slip: { name: "bad.png", data: "data:image/png;base64,AAAA" } })).status, 400);
  assert.equal((await request("/diesel")).data.fills.length, countBefore, "Invalid slips must not save a fill");
  const fill = await request("/diesel", "POST", { ...fillInput, slip });
  assert.equal(fill.status, 201, JSON.stringify(fill.data));
  assert.equal(fill.data.slipUrl, slip.data);
  assert.equal(fill.data.slipName, slip.name);
  assert.ok((await request("/diesel")).data.fills.some((row) => row.id === fill.data.id && row.assetId === assetId));
  assert.equal((await request(`/diesel/${fill.data.id}`, "PATCH", { litres: 55 })).status, 200);
  const savedFill = (await request("/diesel")).data.fills.find((row) => row.id === fill.data.id);
  assert.equal(savedFill.slipUrl, slip.data, "Editing litres must preserve the slip");
  const persistedFill = JSON.parse(fs.readFileSync(path.join(runtime, "diesel_issues.json"), "utf8")).find((row) => row.id === fill.data.id);
  assert.equal(persistedFill.slip_name, slip.name);
  assert.equal(persistedFill.slip_url, slip.data, "The slip survives reloading demo storage");
  assert.equal((await request(`/log/${income.data.id}`, "PATCH", { income: 1200 })).status, 200);
  const entries = (await request("/log")).data.logs.filter((row) => row.assetId === assetId);
  assert.equal(entries.length, 2);
  assert.equal(entries.find((row) => row.id === income.data.id).income, 1200);
  assert.equal(entries.find((row) => row.id === expense.data.id).amount, 200);

  assert.equal((await request(`/assets/${assetId}`, "DELETE")).status, 200);
  assert.ok(!(await request("/assets")).data.assets.some((row) => row.id === assetId));
  assert.ok((await request("/assets/bin")).data.items.some((row) => row.id === assetId));
  assert.equal((await request(`/assets/${assetId}/restore`, "POST", {})).status, 200);
  assert.ok((await request("/assets")).data.assets.some((row) => row.id === assetId));
  for (const endpoint of [`/log/${income.data.id}`, `/log/${expense.data.id}`, `/diesel/${fill.data.id}`, `/drivers/${driver.data.id}`]) {
    assert.equal((await request(endpoint, "DELETE")).status, 200, endpoint);
  }
  assert.equal((await request(`/assets/${assetId}`, "DELETE")).status, 200);
});

test("purchase order amounts recalculate after edits and blank VAT uses the form's default", async () => {
  const created = await request("/procurement/orders", "POST", { supplier: "VAT Test", exclusive: 100, vat: "" });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.vat, 15);
  assert.equal(created.data.total, 115);
  const updated = await request(`/procurement/orders/${created.data.id}`, "PATCH", { ...created.data, exclusive: 200, vat: 30 });
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  assert.equal(updated.data.total, 230, "a stale display total cannot override the amounts");
  await request(`/procurement/orders/${created.data.id}`, "DELETE");
});
