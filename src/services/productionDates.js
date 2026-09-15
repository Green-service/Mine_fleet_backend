import { invalid, isoDate } from "./validation.js";

export function calendarDate(value) {
  try { return isoDate(value, "Date", { required: false }); } catch { return null; }
}

export function dateRange(query = {}) {
  for (const field of ["from", "to"]) {
    if (query[field] != null && typeof query[field] !== "string") throw invalid(`${field === "from" ? "Start" : "End"} date must be a single date.`);
  }
  const from = isoDate(query.from, "Start date", { required: false });
  const to = isoDate(query.to, "End date", { required: false });
  if (from && to && from > to) throw invalid("End date must be on or after the start date.");
  return { from, to };
}

export function inDateRange(date, { from, to }) {
  if (!date) return !from && !to;
  return (!from || date >= from) && (!to || date <= to);
}

export function weekBounds(date) {
  const monday = new Date(`${date}T00:00:00.000Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const thursday = new Date(monday);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const weekYear = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const weekNumber = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
  return {
    weekStart: monday.toISOString().slice(0, 10),
    weekEnd: sunday.toISOString().slice(0, 10),
    week: `${weekYear}-W${String(weekNumber).padStart(2, "0")}`,
  };
}
