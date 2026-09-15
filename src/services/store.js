import { supabase } from "../lib/supabase.js";
import { env } from "../config/env.js";
import { readRuntime, writeRuntime } from "./persistStore.js";
import { validatePayload } from "./validation.js";

function notFound() {
  return Object.assign(new Error("Record not found"), { status: 404 });
}

function databaseError(table, operation, error) {
  const code = error?.code;
  let status = 503;
  let message = `Could not ${operation} ${table.replaceAll("_", " ")}. Check the database connection and try again.`;
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(code)) {
    const migration = ["report_files", "hr_action_tracker", "finance_action_tracker"].includes(table)
      ? "supabase/repair-report-and-action-trackers.sql" : "supabase/migrate-registers.sql";
    let project = "the connected Supabase project";
    try { project = new URL(env.supabaseUrl).hostname; } catch { /* No configured project in local tests. */ }
    const problem = ["42P01", "PGRST205"].includes(code) ? "is unavailable in the API schema" : "has missing required columns";
    message = `The table public.${table} ${problem} (${code}). Run the entire ${migration} file in ${project}'s SQL editor, then retry.`;
  } else if (["42501", "PGRST301", "PGRST302"].includes(code)) {
    message = "Database access was denied. Check the server Supabase credentials and table permissions.";
  } else if (code === "23505") {
    status = 409;
    message = "A record with these identifying details already exists.";
  } else if (code === "23503") {
    status = 409;
    message = "This record refers to a missing record or is still used by another register.";
  } else if (["23502", "23514", "22P02", "22007", "22008", "22003"].includes(code)) {
    status = 400;
    message = "The database rejected an invalid or missing value. Check the required fields, dates and numbers.";
  } else if (code === "PGRST116") {
    return notFound();
  }
  return Object.assign(new Error(message), { status, code });
}

// Dependency injection keeps tests away from the user's database and registers.
export function createStore({ database = null, readLocal = readRuntime, writeLocal = writeRuntime } = {}) {
  function syncMemory(rows, fallback) {
    if (Array.isArray(fallback)) fallback.splice(0, fallback.length, ...structuredClone(rows));
  }
  function localRows(table, fallback) {
    const saved = readLocal(table);
    return Array.isArray(saved) ? structuredClone(saved) : Array.isArray(fallback) ? structuredClone(fallback) : [];
  }

  function saveLocal(table, rows, fallback) {
    // Persist first so disk failure cannot leave a successful in-memory write.
    writeLocal(table, rows);
    if (Array.isArray(fallback)) fallback.splice(0, fallback.length, ...rows);
    return rows;
  }

  async function readTable(table, fallback) {
    if (database) {
      const rows = [];
      let total = null;
      // Supabase limits a single response. Read every page before calculating
      // register totals or returning machine history, including older captures.
      while (true) {
        const { data, error, count } = await database.from(table).select("*", rows.length ? undefined : { count: "exact" })
          .order(table === "app_settings" ? "updated_at" : "created_at", { ascending: false, nullsFirst: false })
          .order("id", { ascending: false })
          .range(rows.length, rows.length + 999);
        if (error) throw databaseError(table, "load", error);
        if (typeof count === "number") total = count;
        if (!data?.length) break;
        rows.push(...data);
        if (total != null && rows.length >= total) break;
      }
      syncMemory(rows, fallback);
      return rows;
    }
    const rows = localRows(table, fallback);
    if (rows.some((row) => !row.id)) {
      return saveLocal(table, rows.map((row) => ({ ...row, id: row.id || crypto.randomUUID() })), fallback);
    }
    return rows;
  }

  async function insertRow(table, input, fallback) {
    const payload = validatePayload(table, input);
    if (database) {
      const { data, error } = await database.from(table).insert(payload).select("*").single();
      if (error || !data) throw databaseError(table, "save", error);
      syncMemory([data, ...(Array.isArray(fallback) ? fallback.filter((row) => row.id !== data.id) : [])], fallback);
      return data;
    }
    const row = { ...payload, id: payload.id || crypto.randomUUID(), created_at: new Date().toISOString() };
    saveLocal(table, [row, ...localRows(table, fallback)], fallback);
    return row;
  }

  async function updateRow(table, id, input, fallback) {
    const payload = validatePayload(table, input, { partial: true });
    if (database) {
      const { data, error } = await database.from(table).update(payload).eq("id", id).select("*").single();
      if (error || !data) throw databaseError(table, "update", error);
      syncMemory(Array.isArray(fallback) ? fallback.map((row) => row.id === id ? data : row) : [], fallback);
      return data;
    }
    const rows = localRows(table, fallback);
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) throw notFound();
    const row = { ...rows[index], ...payload, id };
    rows[index] = row;
    saveLocal(table, rows, fallback);
    return row;
  }

  async function deleteRow(table, id, fallback) {
    if (database) {
      // Returned IDs distinguish a real deletion from a stale ID or RLS no-op.
      const { data, error } = await database.from(table).delete().eq("id", id).select("id");
      if (error) throw databaseError(table, "delete", error);
      if (!data?.length) throw notFound();
      syncMemory(Array.isArray(fallback) ? fallback.filter((row) => row.id !== id) : [], fallback);
      return { ok: true };
    }
    const rows = localRows(table, fallback);
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) throw notFound();
    rows.splice(index, 1);
    saveLocal(table, rows, fallback);
    return { ok: true };
  }

  return { readTable, insertRow, updateRow, deleteRow };
}

export const { readTable, insertRow, updateRow, deleteRow } = createStore({ database: supabase });

export function persistenceStatus() {
  return { supabase: Boolean(supabase), localStore: !supabase, runtimeDir: "server/data/runtime" };
}
