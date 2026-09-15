import { deleteRow, insertRow, readTable, updateRow } from "./store.js";
import { isoDate, validateInput } from "./validation.js";

/**
 * Builds { list, create, update, remove } for a simple Supabase-or-local-fallback
 * table, reusing store.js. `toRow` shapes a raw DB/fallback row for the frontend;
 * `toPayload(input, previous)` shapes a frontend submission back into DB columns.
 */
export function makeCollection(table, fallback, { toRow = (row) => row, toPayload = (input) => input, uniqueBy = [] } = {}) {
  async function assertUnique(payload, id = null) {
    if (!uniqueBy.length) return;
    const rows = await readTable(table, fallback);
    const keyValue = (field, value) => {
      if (field === "work_date") {
        try { return isoDate(value); } catch { return String(value ?? "").trim(); }
      }
      if (field === "machine") return String(value ?? "").replace(/\s/g, "").toLowerCase();
      return String(value ?? "").trim().toLowerCase();
    };
    const conflict = rows.some((row) => row.id !== id && uniqueBy.every((field) => keyValue(field, row[field]) === keyValue(field, payload[field])));
    if (conflict) throw Object.assign(new Error("An entry for this date or register reference already exists. Edit that entry instead."), { status: 409 });
  }
  async function list() {
    const rows = await readTable(table, fallback);
    return rows.map(toRow);
  }

  async function create(body) {
    validateInput(table, body);
    const payload = toPayload(body);
    await assertUnique(payload);
    const saved = await insertRow(table, payload, fallback);
    return toRow({ ...payload, ...saved });
  }

  async function update(id, body) {
    validateInput(table, body);
    const rows = await readTable(table, fallback);
    const previous = rows.find((row) => row.id === id);
    if (!previous) {
      const err = new Error("Record not found");
      err.status = 404;
      throw err;
    }
    // Preserve database and form aliases when applying partial updates.
    const payload = toPayload(body, { ...previous, ...toRow(previous) });
    await assertUnique(payload, id);
    const saved = await updateRow(table, id, payload, fallback);
    return toRow({ ...previous, ...payload, ...saved, id });
  }

  async function remove(id) {
    await deleteRow(table, id, fallback);
    return { ok: true };
  }

  return { list, create, update, remove };
}

export function str(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

export function optStr(value, previousValue) {
  if (value === undefined) return previousValue ?? null;
  if (value === null || value === "") return null;
  return String(value).trim();
}

export function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function optNum(value, previousValue) {
  if (value === undefined) return previousValue ?? null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
