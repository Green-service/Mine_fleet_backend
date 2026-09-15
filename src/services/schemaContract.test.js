import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const schema = fs.readFileSync(new URL("../../../supabase/schema.sql", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../../../supabase/migrate-registers.sql", import.meta.url), "utf8");
const productionMigration = fs.readFileSync(new URL("../../../supabase/migrate-production-links.sql", import.meta.url), "utf8");

test("register repair covers every canonical table and column, including legacy employee capture fields", () => {
  const definitions = [...schema.matchAll(/create table if not exists ([a-z_]+) \(([\s\S]*?)\n\);/g)];
  assert.ok(definitions.length > 60);
  for (const [, table, definition] of definitions) {
    assert.ok(migration.includes(`create table if not exists ${table} (`), `${table} must be created if missing`);
    for (const line of definition.split("\n")) {
      const column = line.trim().match(/^([a-z_]+)\s/)?.[1];
      if (!column || ["unique", "constraint", "foreign", "primary", "check"].includes(column)) continue;
      assert.ok(migration.includes(`alter table public.${table} add column if not exists ${column} `), `${table}.${column} must be repairable on existing tables`);
    }
  }
  assert.match(migration, /employees add column if not exists clock_in text/);
  assert.match(migration, /notify pgrst, 'reload schema'/);
});

test("register repair preserves existing records and table access policies", () => {
  assert.doesNotMatch(migration, /^\s*(delete from|truncate|drop table|update\s+\w+\s+set)/im);
  assert.doesNotMatch(migration, /disable row level security/i);
  assert.match(migration, /begin;/);
  assert.match(migration, /commit;/);
});

test("production linkage migration preserves unknown category breakdowns, undated captures and historical weeks", () => {
  for (const column of ["product_loader", "sscc", "pci", "sn_ss2", "p2c_ss2_be", "buffalo_loader", "screen", "total"]) {
    assert.match(productionMigration, new RegExp(`production_gg_daily add column if not exists ${column} numeric;`));
    assert.doesNotMatch(productionMigration, new RegExp(`${column} numeric (?:not null|default)`));
  }
  assert.match(productionMigration, /machine_hours add column if not exists work_date date;/);
  assert.match(productionMigration, /production_blf_daily add column if not exists equipment text;/);
  assert.doesNotMatch(productionMigration, /^\s*(update|delete from|truncate|drop table|insert into)/im);
  assert.match(productionMigration, /notify pgrst, 'reload schema'/);
});
