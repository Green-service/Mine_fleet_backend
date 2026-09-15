import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { summarizeSafetyMonths } from "../src/services/safetyMonthlyReport.js";

for (const key of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) process.env[key] = "";
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "mpg-safety-test-"));
process.env.MPG_RUNTIME_DIR = runtime;
const { safetyRouter } = await import("../src/routes/safety.js");
const { breakdownsRouter } = await import("../src/routes/breakdowns.js");
let server, base;
before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/safety", safetyRouter);
  app.use("/breakdowns", breakdownsRouter);
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  const resolved = path.resolve(runtime);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith("mpg-safety-test-"));
  fs.rmSync(resolved, { recursive: true, force: true });
});
async function request(endpoint, method = "GET", body) {
  const response = await fetch(`${base}${endpoint}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}

test("safety performance supports persisted create, partial update and delete", async () => {
  const input = { indicator: "Inspection completion", result: "92% September 2092", status: "Monitor", comment: "Monthly review" };
  const created = await request("/safety/performance", "POST", input);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const endpoint = `/safety/performance/${created.data.id}`;
  assert.ok((await request("/safety/performance")).data.some((row) => row.id === created.data.id));
  const updated = await request(endpoint, "PATCH", { status: "On Target" });
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  assert.equal(updated.data.result, input.result);
  assert.equal(updated.data.indicator, input.indicator);
  assert.equal(updated.data.status, "On Target");
  assert.equal((await request(endpoint, "DELETE")).status, 200);
  assert.ok(!(await request("/safety/performance")).data.some((row) => row.id === created.data.id));
});

test("availability persists hours and calculates status through partial edits and deletion", async () => {
  const created = await request("/breakdowns/availability", "POST", { plant: "TEST-AVAIL", type: "CAT loader / September 2092", hoursWorked: 90, breakdownHours: 10, failures: 2, availability: "5%" });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.availability, "90%");
  assert.equal(created.data.status, "On Target");
  const endpoint = `/breakdowns/availability/${created.data.id}`;
  const updated = await request(endpoint, "PATCH", { breakdownHours: 30 });
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  assert.equal(updated.data.hoursWorked, 90);
  assert.equal(updated.data.failures, 2);
  assert.equal(updated.data.availability, "75%");
  assert.equal(updated.data.status, "Critical");
  const saved = (await request("/breakdowns/availability")).data.find((row) => row.id === created.data.id);
  assert.equal(saved.availability, "75%");
  assert.equal((await request(endpoint, "DELETE")).status, 200);
  assert.ok(!(await request("/breakdowns/availability")).data.some((row) => row.id === created.data.id));
});

test("monthly safety summary follows individual action create, completion and delete", async () => {
  const created = await request("/safety/individual", "POST", { person: "Test supervisor", action: "Repair handrail", start: "2092-06-01", due: "2092-06-15", status: "Scheduled" });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const month = async () => (await request("/safety/monthly-report")).data.find((row) => row.month === "2092-06");
  assert.equal((await month()).total, 1);
  assert.equal((await month()).scheduled, 1);
  assert.equal((await month()).open, 1);
  assert.equal((await request(`/safety/individual/${created.data.id}`, "PATCH", { status: "Completed" })).status, 200);
  assert.equal((await month()).completed, 1);
  assert.equal((await month()).open, 0);
  assert.equal((await month()).closedRate, "100.0%");
  assert.equal((await request(`/safety/individual/${created.data.id}`, "DELETE")).status, 200);
  assert.equal(await month(), undefined);
});

test("invalid availability and indicator inputs fail validation", async () => {
  for (const [endpoint, body] of [
    ["/breakdowns/availability", { plant: "TEST", hoursWorked: 0, breakdownHours: 0 }],
    ["/breakdowns/availability", { plant: "TEST", hoursWorked: -1, breakdownHours: 10 }],
    ["/breakdowns/availability", { plant: "TEST", hoursWorked: "invalid", breakdownHours: 10 }],
    ["/breakdowns/availability", { plant: "TEST", hoursWorked: 10, failures: 1.5 }],
    ["/safety/performance", { indicator: "", result: "80%" }],
    ["/safety/performance", { indicator: "Inspections", result: "80%", status: "Made up" }],
    ["/safety/individual", { action: "Test", person: "Supervisor", start: "2092-01-10", due: "2092-01-01" }],
    ["/breakdowns/inventory", { site: "Belfast", desc: "Filter", qty: -1 }],
    ["/breakdowns/inventory", { site: "Belfast", desc: "Filter", qty: 1.5 }],
  ]) assert.equal((await request(endpoint, "POST", body)).status, 400, endpoint);
});

test("closed breakdowns leave the open and critical KPI counts", async () => {
  const created = await request("/breakdowns", "POST", { machine: "TEST-CLOSED", failure: "Pump leak", severity: "Critical", downtime: "8 hrs" });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const before = (await request("/breakdowns")).data.kpis;
  assert.equal((await request(`/breakdowns/${created.data.id}`, "PATCH", { status: "Closed" })).status, 200);
  const after = (await request("/breakdowns")).data.kpis;
  assert.equal(after.open, before.open - 1);
  assert.equal(after.critical, before.critical - 1);
  await request(`/breakdowns/${created.data.id}`, "DELETE");
});

test("monthly summary distinguishes overdue, completed and unassessed actions without inventing completion dates", () => {
  const rows = summarizeSafetyMonths([
    { start: "2026-09-01", due: "2026-09-02", status: "In- Progress" },
    { start: "2026-09-01", due: "2026-09-02", status: "Completed" },
    { start: "2026-09-01", status: "Not Applicable" },
    { createdAt: "2026-09-10T00:00:00+00:00", status: "Not Yet Assessed" },
    { start: "invalid", status: "Scheduled" },
  ], "2026-09-12");
  const september = rows.find((row) => row.month === "2026-09");
  assert.equal(september.total, 4);
  assert.equal(september.overdue, 1);
  assert.equal(september.completed, 1);
  assert.equal(september.completedOverdue, 0);
  assert.equal(september.notStarted, 1);
  assert.equal(september.closedRate, "33.3%");
  assert.equal(rows.find((row) => row.month === "Unscheduled").scheduled, 1);
});
