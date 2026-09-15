import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";

for (const key of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) process.env[key] = "";
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "mpg-portfolio-validation-"));
process.env.MPG_RUNTIME_DIR = runtime;
const { router } = await import("../src/routes/index.js");
let server, base, assetId, driverId;
const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";
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
  const created = await request("/assets", "POST", { assetCode: "VALIDATION-VEHICLE", makeModel: "Toyota Hilux", type: "Bakkie", purchaseCost: 100, photos: [photo] });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assetId = created.data.id;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  assert.equal(path.dirname(path.resolve(runtime)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(runtime).startsWith("mpg-portfolio-validation-"));
  fs.rmSync(runtime, { recursive: true, force: true });
});

test("invalid asset amounts, dates and missing drivers fail without changing saved assets", async () => {
  for (const patch of [{ purchaseCost: "abc" }, { odometerKm: -1 }, { nextServiceDateIso: "2091-02-30" }, { serviceIntervalKm: 0 }, { assignedDriverId: "missing-driver" }]) {
    const result = await request(`/assets/${assetId}`, "PATCH", patch);
    assert.ok([400, 404].includes(result.status), JSON.stringify(result));
  }
  const current = await request(`/assets/${assetId}`);
  assert.equal(current.data.purchaseCost, 100);
  assert.equal(current.data.assignedDriverId, null);
  const count = (await request("/assets")).data.assets.length;
  const result = await request("/assets", "POST", { assetCode: "REJECTED-ASSET", makeModel: "Toyota", photos: [photo], assignedDriverId: "missing-driver" });
  assert.equal(result.status, 404);
  assert.equal((await request("/assets")).data.assets.length, count);
});

test("driver validates phone and selected asset before inserting, and explicit unassignment updates both registers", async () => {
  const count = (await request("/drivers")).data.drivers.length;
  for (const body of [{ name: "Invalid", phone: "abc" }, { name: "Invalid", phone: "0825550123", assetId: "missing-asset" }]) {
    const result = await request("/drivers", "POST", body);
    assert.ok([400, 404].includes(result.status), JSON.stringify(result));
  }
  assert.equal((await request("/drivers")).data.drivers.length, count);
  const created = await request("/drivers", "POST", { name: "Test Driver", phone: "+27 82 555 0123", assetId });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  driverId = created.data.id;
  assert.equal((await request(`/assets/${assetId}`)).data.assignedDriverId, driverId);
  const unassigned = await request(`/drivers/${driverId}`, "PATCH", { assetId: null });
  assert.equal(unassigned.status, 200, JSON.stringify(unassigned.data));
  assert.equal(unassigned.data.assetId, null);
  assert.equal((await request(`/assets/${assetId}`)).data.assignedDriverId, null);
});

test("logs reject malformed amounts, impossible dates and missing asset changes while preserving valid entries", async () => {
  const created = await request("/log", "POST", { assetId, periodStartIso: "2091-01-01", income: 100, deductions: 10 });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  for (const patch of [{ income: "abc" }, { deductions: -20 }, { periodStartIso: "2091-02-30" }, { assetId: "missing-asset" }, { periodType: "invalid" }]) {
    const result = await request(`/log/${created.data.id}`, "PATCH", patch);
    assert.ok([400, 404].includes(result.status), JSON.stringify(result));
  }
  const saved = (await request("/log")).data.logs.find((row) => row.id === created.data.id);
  assert.equal(saved.income, 100);
  assert.equal(saved.deductions, 10);
  assert.equal(saved.assetId, assetId);
});
