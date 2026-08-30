import { supabase } from "../lib/supabase.js";

export async function readTable(table, fallback) {
  if (!supabase) return structuredClone(fallback);
  const { data, error } = await supabase.from(table).select("*").order("created_at", { ascending: false });
  if (error) {
    console.warn(`[supabase] ${table}: ${error.message}`);
    return structuredClone(fallback);
  }
  return data?.length ? data : structuredClone(fallback);
}

export async function insertRow(table, payload, fallbackList) {
  if (!supabase) {
    const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...payload };
    fallbackList.unshift(row);
    return row;
  }
  const { data, error } = await supabase.from(table).insert(payload).select("*").single();
  if (error) {
    const err = new Error(error.message);
    err.status = 400;
    throw err;
  }
  return data;
}
