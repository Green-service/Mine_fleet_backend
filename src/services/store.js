import { supabase } from "../lib/supabase.js";
import { readRuntime, writeRuntime } from "./persistStore.js";

function demoRow(payload) {
  return { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...payload };
}

function notFound() {
  const err = new Error("Record not found");
  err.status = 404;
  return err;
}

function localRows(table, fallback) {
  const saved = readRuntime(table);
  if (saved?.length) return saved;
  return Array.isArray(fallback) ? [...fallback] : [];
}

function applyLocal(table, rows, fallbackList) {
  if (!Array.isArray(fallbackList)) return rows;
  fallbackList.length = 0;
  fallbackList.push(...rows);
  writeRuntime(table, rows);
  return rows;
}

const ORDER_COLUMN = {
  app_settings: "updated_at",
};

export async function readTable(table, fallback) {
  const local = localRows(table, fallback);

  if (!supabase) {
    return local.length ? local : fallback;
  }

  const orderBy = ORDER_COLUMN[table] || "created_at";
  let query = supabase.from(table).select("*");
  query = query.order(orderBy, { ascending: false, nullsFirst: false });
  const { data, error } = await query;
  if (error) {
    console.warn(`[supabase] read ${table}: ${error.message} — treating register as empty`);
    if (Array.isArray(fallback)) {
      applyLocal(table, [], fallback);
      return [];
    }
    return fallback;
  }

  const dbRows = data ?? [];
  if (Array.isArray(fallback)) {
    applyLocal(table, dbRows, fallback);
  }
  return dbRows;
}

export async function insertRow(table, payload, fallbackList) {
  if (supabase) {
    const { data, error } = await supabase.from(table).insert(payload).select("*").single();
    if (!error && data) {
      const rows = localRows(table, fallbackList).filter((row) => row.id !== data.id);
      rows.unshift(data);
      applyLocal(table, rows, fallbackList);
      return data;
    }
    if (error) {
      console.warn(`[supabase] insert ${table}: ${error.message} — saving locally instead`);
    }
  }

  const row = demoRow(payload);
  const rows = localRows(table, fallbackList);
  rows.unshift(row);
  applyLocal(table, rows, fallbackList);
  return row;
}

export async function updateRow(table, id, payload, fallbackList) {
  if (supabase) {
    const { data, error } = await supabase.from(table).update(payload).eq("id", id).select("*").single();
    if (!error && data) {
      const rows = localRows(table, fallbackList).map((row) => (row.id === id ? { ...row, ...data } : row));
      applyLocal(table, rows, fallbackList);
      return data;
    }
    if (error) {
      console.warn(`[supabase] update ${table}: ${error.message} — updating local copy`);
    }
  }

  const rows = localRows(table, fallbackList);
  const row = rows.find((item) => item.id === id);
  if (!row) throw notFound();
  Object.assign(row, payload);
  applyLocal(table, rows, fallbackList);
  return row;
}

export async function deleteRow(table, id, fallbackList) {
  if (supabase) {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (!error) {
      const rows = localRows(table, fallbackList).filter((item) => item.id !== id);
      applyLocal(table, rows, fallbackList);
      return { ok: true };
    }
    console.warn(`[supabase] delete ${table}: ${error.message} — deleting local copy`);
  }

  const rows = localRows(table, fallbackList);
  const index = rows.findIndex((item) => item.id === id);
  if (index < 0) throw notFound();
  rows.splice(index, 1);
  applyLocal(table, rows, fallbackList);
  return { ok: true };
}

export function persistenceStatus() {
  return {
    supabase: Boolean(supabase),
    localStore: true,
    runtimeDir: "server/data/runtime",
  };
}
