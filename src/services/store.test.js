import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";

function databaseResult(result) {
  const query = new Proxy({}, {
    get(_target, key) {
      if (key === "then") return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
      return () => query;
    },
  });
  return { from: () => query };
}

function memoryDisk() {
  const rows = new Map();
  return {
    readLocal: (table) => rows.has(table) ? structuredClone(rows.get(table)) : null,
    writeLocal: (table, value) => rows.set(table, structuredClone(value)),
  };
}

test("local register create, edit and delete survive a fresh store and empty saved register", async () => {
  const disk = memoryDisk();
  let store = createStore(disk);
  const seed = [{ id: "seed", machine: "CMPG044" }];
  const added = await store.insertRow("test_register", { machine: "CMPG046" }, seed);
  store = createStore(disk);
  assert.equal((await store.readTable("test_register", []))[0].machine, "CMPG046");
  await store.updateRow("test_register", added.id, { machine: "CMPG050" }, []);
  assert.equal((await store.readTable("test_register", []))[0].machine, "CMPG050");
  await store.deleteRow("test_register", added.id, []);
  await store.deleteRow("test_register", "seed", []);
  store = createStore(disk);
  assert.deepEqual(await store.readTable("test_register", [{ id: "seed", machine: "CMPG044" }]), []);
  await assert.rejects(store.deleteRow("test_register", added.id, []), (error) => error.status === 404);
});

test("failed configured database operations never silently write or fall back to a local register", async () => {
  let localAccesses = 0;
  const store = createStore({
    database: databaseResult({ data: null, error: { code: "PGRST205", message: "relation missing" } }),
    readLocal() { localAccesses += 1; return []; },
    writeLocal() { localAccesses += 1; },
  });
  const fallback = [{ id: "existing" }];
  const check = (error) => error.status === 503 && error.message.includes("migrate-registers.sql");
  await assert.rejects(store.readTable("test_register", fallback), check);
  await assert.rejects(store.insertRow("test_register", { name: "New" }, fallback), check);
  await assert.rejects(store.updateRow("test_register", "existing", { name: "New" }, fallback), check);
  await assert.rejects(store.deleteRow("test_register", "existing", fallback), check);
  assert.equal(localAccesses, 0);
  assert.deepEqual(fallback, [{ id: "existing" }]);
});

test("missing report and tracker schemas identify the table, failure and focused repair", async () => {
  for (const table of ["report_files", "hr_action_tracker", "finance_action_tracker"]) {
    for (const code of ["PGRST205", "42P01", "PGRST204", "42703"]) {
      const store = createStore({ database: databaseResult({ error: { code } }) });
      await assert.rejects(store.readTable(table, []), (error) => {
        assert.equal(error.status, 503);
        assert.ok(error.message.includes(`public.${table}`));
        assert.ok(error.message.includes(code));
        assert.ok(error.message.includes("repair-report-and-action-trackers.sql"));
        assert.ok(error.message.includes(["PGRST205", "42P01"].includes(code) ? "unavailable in the API schema" : "missing required columns"));
        return true;
      });
    }
  }
});

test("empty database remains empty even when demo or local records exist", async () => {
  const store = createStore({ database: databaseResult({ data: [], error: null }), readLocal() { throw new Error("Do not read local data"); } });
  assert.deepEqual(await store.readTable("test_register", [{ id: "seed" }]), []);
});

test("complete history is loaded beyond the database response cap before totals are calculated", async () => {
  const records = Array.from({ length: 1205 }, (_, index) => ({ id: String(index), hours: 2 }));
  const ranges = [];
  const database = { from() {
    let selectedCount;
    const query = {
      select(_columns, options) { selectedCount = options?.count; return query; },
      order() { return query; },
      range(from, to) {
        ranges.push([from, to]);
        // Exercise a project configured with a lower cap than requested.
        return Promise.resolve({ data: records.slice(from, Math.min(to + 1, from + 500)), error: null, count: selectedCount ? records.length : null });
      },
    };
    return query;
  } };
  const fallback = [];
  const rows = await createStore({ database }).readTable("machine_hours", fallback);
  assert.equal(rows.length, 1205);
  assert.equal(rows.reduce((sum, row) => sum + row.hours, 0), 2410);
  assert.equal(fallback.length, 1205);
  assert.deepEqual(ranges, [[0, 999], [500, 1499], [1000, 1999]]);
});

test("a later database page failure does not return or cache a partial register", async () => {
  let page = 0;
  const database = { from() {
    const query = {
      select() { return query; }, order() { return query; },
      range() { return Promise.resolve(page++ === 0 ? { data: [{ id: "new" }], error: null, count: 2 } : { data: null, error: { code: "42501" } }); },
    };
    return query;
  } };
  const fallback = [{ id: "existing" }];
  await assert.rejects(createStore({ database }).readTable("machine_hours", fallback), /access was denied/);
  assert.deepEqual(fallback, [{ id: "existing" }]);
});

test("database deletion must actually return a deleted record", async () => {
  const store = createStore({ database: databaseResult({ data: [], error: null }) });
  await assert.rejects(store.deleteRow("test_register", "missing", []), (error) => error.status === 404);
});

test("successful remote writes do not depend on a writable local snapshot", async () => {
  const saved = { id: "db-id", name: "Saved remotely" };
  const store = createStore({ database: databaseResult({ data: saved, error: null }), writeLocal() { throw new Error("Disk unavailable"); } });
  assert.deepEqual(await store.insertRow("test_register", { name: saved.name }, []), saved);
});

test("a failed local write leaves the original register unchanged", async () => {
  const original = [{ id: "first", machine: "CMPG044" }];
  const store = createStore({ readLocal: () => null, writeLocal() { throw new Error("Disk full"); } });
  await assert.rejects(store.updateRow("test_register", "first", { machine: "CMPG046" }, original), /Disk full/);
  assert.deepEqual(original, [{ id: "first", machine: "CMPG044" }]);
});

test("database conflicts and invalid values have actionable non-success statuses", async () => {
  for (const [code, status] of [["23505", 409], ["23503", 409], ["23514", 400], ["42501", 503]]) {
    const store = createStore({ database: databaseResult({ data: null, error: { code } }) });
    await assert.rejects(store.insertRow("test_register", { name: "Test" }, []), (error) => error.status === status);
  }
});
