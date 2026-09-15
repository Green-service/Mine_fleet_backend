// Read-only: checks column availability without retrieving any record values.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { supabase } from "../src/lib/supabase.js";

const schema = fs.readFileSync(fileURLToPath(new URL("../../supabase/schema.sql", import.meta.url)), "utf8");
const tables = new Map();
for (const [, table, definition] of schema.matchAll(/create table if not exists ([a-z_]+) \(([\s\S]*?)\n\);/g)) {
  const columns = definition.split("\n").map((line) => line.trim().match(/^([a-z_]+)\s/)).filter(Boolean)
    .map((match) => match[1]).filter((column) => !["unique", "constraint", "foreign", "primary", "check"].includes(column));
  tables.set(table, new Set(columns));
}
for (const [, table, column] of schema.matchAll(/^alter table ([a-z_]+) add column if not exists ([a-z_]+) /gm)) {
  tables.get(table)?.add(column);
}

if (!supabase) {
  console.log("Schema audit skipped: no configured Supabase connection (local mode).");
  process.exitCode = 0;
} else {
  const entries = [...tables];
  const outcomes = [];
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < entries.length) {
      const [table, columns] = entries[next++];
      try {
        const selected = [...columns].join(",");
        let result = await supabase.from(table).select(selected, { head: true }).limit(1).abortSignal(AbortSignal.timeout(6000));
        if (result.error && result.status >= 400 && !result.error.code) {
          // HEAD omits the PostgREST error body. LIMIT 0 obtains its error code
          // without reading a row when a table or column is absent.
          result = await supabase.from(table).select(selected).limit(0).abortSignal(AbortSignal.timeout(6000));
        }
        outcomes.push({ table, status: result.error ? result.error.code || (result.status ? `HTTP_${result.status}` : "CONNECTION_ERROR") : "OK" });
      } catch {
        outcomes.push({ table, status: "CONNECTION_ERROR" });
      }
    }
  }));
  for (const outcome of outcomes.sort((a, b) => a.table.localeCompare(b.table))) console.log(`${outcome.table}: ${outcome.status}`);
  const failed = outcomes.filter((outcome) => outcome.status !== "OK").length;
  console.log(`Checked ${outcomes.length} tables without reading rows; ${failed} require attention.`);
  process.exitCode = failed ? 1 : 0;
}
