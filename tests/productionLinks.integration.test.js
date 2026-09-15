import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";

for (const key of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) process.env[key] = "";
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "mpg-production-links-"));
process.env.MPG_RUNTIME_DIR = runtime;
const initial = {
  production_gg_daily: [{ id: "legacy-day", work_date: "03/01/2090", target: 500, actual: 450 }],
  production_gg_week: [{ id: "legacy-week", week: "Historical week", product_loader: 999, total: 999 }],
  production_blf_daily: [], machine_hours: [],
  equipment: [{ id: "unit", fleet_no: "CMPG004", equipment: "CAT 966", category: "Front-End Loader", site: "Belfast" }],
  production_shifts: [],
};
for (const [table, rows] of Object.entries(initial)) fs.writeFileSync(path.join(runtime, `${table}.json`), JSON.stringify(rows));
const { router } = await import("../src/routes/index.js");
let server, base;
async function request(endpoint, method = "GET", body) {
  const response = await fetch(`${base}${endpoint}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}
before(async () => {
  const app = express();
  app.use(express.json()); app.use("/api", router);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  assert.equal(path.dirname(path.resolve(runtime)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(runtime).startsWith("mpg-production-links-"));
  fs.rmSync(runtime, { recursive: true, force: true });
});

test("GG daily categories drive inclusive Monday-to-Sunday weeks through add, partial edit, move and delete", async () => {
  const monday = await request("/production/gg-daily", "POST", { date: "2091-01-08", productLoader: 100, sscc: 20, pci: 5, total: 9999, actual: 9999 });
  assert.equal(monday.status, 201, JSON.stringify(monday.data));
  assert.equal(monday.data.total, 125);
  assert.equal(monday.data.actual, 125);
  assert.equal(monday.data.isLegacyTotal, false);
  const sunday = await request("/production/gg-daily", "POST", { date: "2091-01-14", productLoader: 10, screen: 30 });
  assert.equal(sunday.status, 201, JSON.stringify(sunday.data));
  const following = await request("/production/gg-daily", "POST", { date: "2091-01-15", buffaloLoader: 75 });
  assert.equal(following.status, 201);
  const weeks = () => request("/production/gg-week?from=2091-01-08&to=2091-01-21");
  let rows = (await weeks()).data;
  assert.equal(rows.length, 2);
  const first = rows.find((row) => row.weekStart === "2091-01-08");
  assert.equal(first.weekEnd, "2091-01-14");
  assert.equal(first.total, 165);
  assert.equal(first.productLoader, 110);
  assert.equal(first.dayCount, 2);
  const bounded = await request("/production/gg-week?from=2091-01-14&to=2091-01-14");
  assert.equal(bounded.data[0].total, 40, "date filter sums selected days only, not an entire overlapping week");
  const changed = await request(`/production/gg-daily/${monday.data.id}`, "PATCH", { sscc: 50 });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.equal(changed.data.productLoader, 100);
  assert.equal(changed.data.total, 155);
  const moved = await request(`/production/gg-daily/${sunday.data.id}`, "PATCH", { date: "2091-01-16" });
  assert.equal(moved.status, 200);
  rows = (await weeks()).data;
  assert.equal(rows.find((row) => row.weekStart === "2091-01-08").total, 155);
  assert.equal(rows.find((row) => row.weekStart === "2091-01-15").total, 115);
  assert.equal((await request(`/production/gg-daily/${monday.data.id}`, "DELETE")).status, 200);
  assert.ok(!(await weeks()).data.some((row) => row.weekStart === "2091-01-08"));
  assert.equal((await request("/production/gg-week", "POST", { week: "test", total: 999 })).status, 405);
});

test("legacy GG totals preserve unknown category breakdown and manual weeks remain separate", async () => {
  assert.equal((await request("/production/gg-daily", "POST", { date: "2090-01-03", actual: 100 })).status, 409, "legacy DD/MM/YYYY date conflicts with the same ISO calendar day");
  const legacy = (await request("/production/gg-daily")).data.find((row) => row.id === "legacy-day");
  assert.equal(legacy.isLegacyTotal, true);
  assert.equal(legacy.productLoader, null);
  assert.equal(legacy.total, 450);
  const changed = await request("/production/gg-daily/legacy-day", "PATCH", { date: "2090-01-04", productLoader: "", sscc: "" });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.equal(changed.data.total, 450);
  assert.equal(changed.data.isLegacyTotal, true);
  const weeks = await request("/production/gg-week?from=2090-01-01&to=2090-01-10");
  assert.equal(weeks.data[0].total, 450);
  assert.equal(weeks.data[0].legacyTonnage, 450);
  assert.equal(weeks.data[0].productLoader, null);
  const manual = await request("/production/gg-week-legacy");
  assert.equal(manual.data[0].total, 999);
  assert.equal(manual.data[0].source, "legacy-weekly");
});

test("Belfast machine summary and dated history use the same captures and preserve undated legacy hours", async () => {
  const first = await request("/production/blf-daily", "POST", { date: "2091-02-01", machine: "CMPG004", opening: 100, closing: 110, downtime: 2, standby: 1, pm: 3 });
  const second = await request("/production/blf-daily", "POST", { date: "2091-02-03", machine: "CMPG004", opening: 110, closing: 118, downtime: 1, standby: 2, pm: 1 });
  assert.equal(first.status, 201); assert.equal(second.status, 201);
  const duplicate = await request("/production/blf-daily", "POST", { date: "2091-02-01", machine: " cmpg 004 ", opening: 100, closing: 110 });
  assert.equal(duplicate.status, 409, "whitespace and case cannot create another capture for the same machine/day");
  const undated = await request("/production/hours", "POST", { machine: "CMPG004", site: "Belfast", hours: 50, downtime: 5 });
  assert.equal(undated.status, 201);
  assert.equal(undated.data.date, null);
  const all = await request("/production/machine-hours?machine=cmpg004");
  assert.equal(all.status, 200, JSON.stringify(all.data));
  assert.equal(all.data.entries.length, 3);
  assert.equal(all.data.machines.length, 1);
  assert.equal(all.data.machines[0].hours, 68);
  assert.equal(all.data.machines[0].datedHours, 18);
  assert.equal(all.data.machines[0].undatedHours, 50);
  assert.equal(all.data.machines[0].equipment, "CAT 966");
  assert.equal(all.data.entries.find((row) => row.source === "legacy").date, null);
  assert.equal(all.data.entries.find((row) => row.source === "legacy").editPath, `/production/hours/${undated.data.id}`);
  const bounded = await request("/production/machine-hours?from=2091-02-01&to=2091-02-03&machine=CMPG004");
  assert.equal(bounded.data.entries.length, 2);
  assert.equal(bounded.data.totals.hours, 18);
  assert.equal(bounded.data.totals.downtime, 3);
  assert.equal(bounded.data.totals.standby, 3);
  assert.equal(bounded.data.totals.pm, 4);
  assert.equal(bounded.data.excludedUndatedCount, 1);
  assert.equal((await request(`/production/blf-daily/${first.data.id}`, "PATCH", { closing: 112 })).status, 200);
  assert.equal((await request("/production/machine-hours?from=2091-02-01&to=2091-02-03&machine=CMPG004")).data.totals.hours, 20);
  assert.equal((await request(`/production/blf-daily/${second.data.id}`, "DELETE")).status, 200);
  assert.equal((await request("/production/machine-hours?from=2091-02-01&to=2091-02-03&machine=CMPG004")).data.totals.hours, 12);
  const dated = await request(`/production/hours/${undated.data.id}`, "PATCH", { date: "2091-02-02" });
  assert.equal(dated.status, 200);
  assert.equal((await request("/production/machine-hours?from=2091-02-02&to=2091-02-02&machine=CMPG004")).data.totals.hours, 50);
});

test("production filters and category validation reject invalid ranges, impossible dates and negative values", async () => {
  for (const endpoint of ["/production/gg-week?from=2091-02-02&to=2091-02-01", "/production/machine-hours?from=2091-02-30", "/production/machine-hours?from=2091-02-03&to=2091-02-01"]) {
    assert.equal((await request(endpoint)).status, 400, endpoint);
  }
  assert.equal((await request("/production/gg-daily", "POST", { date: "2091-03-01", productLoader: -1 })).status, 400);
  assert.equal((await request("/production/gg-daily", "POST", { date: "2091-03-01", productLoader: "bad" })).status, 400);
  const fractional = await request("/production/gg-daily", "POST", { date: "2091-03-01", productLoader: 0.0004, sscc: 0.0004 });
  assert.equal(fractional.status, 201);
  assert.equal(fractional.data.total, 0.0008, "totals preserve the precision accepted by numeric capture fields");
});

test("categorized GG actuals retain shift targets, fall back to forecasts, and never double count shifts", async () => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const shift = await request("/production", "POST", { date: today, site: "GG", target: 100, actual: 90 });
  assert.equal(shift.status, 201);
  const forecast = await request("/production/forecast-daily", "POST", { date: today, productLoading: 300 });
  assert.equal(forecast.status, 201, JSON.stringify(forecast.data));
  const captured = await request("/production/gg-daily", "POST", { date: today, productLoader: 150 });
  assert.equal(captured.status, 201);
  let summary = (await request("/production")).data.summary;
  assert.equal(summary.dailyTarget, 100);
  assert.equal(summary.dailyActual, 150);
  assert.equal((await request(`/production/${shift.data.id}`, "PATCH", { target: 0 })).status, 200);
  summary = (await request("/production")).data.summary;
  assert.equal(summary.dailyTarget, 300);
  assert.equal(summary.dailyActual, 150);
  assert.equal((await request(`/production/gg-daily/${captured.data.id}`, "PATCH", { target: 400 })).status, 200);
  assert.equal((await request("/production")).data.summary.dailyTarget, 400);
  assert.equal((await request(`/production/gg-daily/${captured.data.id}`, "DELETE")).status, 200);
  assert.equal((await request("/production")).data.summary.dailyActual, 90);
});
