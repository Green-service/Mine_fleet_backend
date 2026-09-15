import * as catalog from "../data/catalog.js";
import * as ref from "../data/referenceCatalog.js";
import { readTable } from "./store.js";
import { invalid } from "./validation.js";
import { calendarDate, dateRange, inDateRange } from "./productionDates.js";
import { machineIdentity, machineReference } from "./productionMachine.js";

const amount = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const rounded = (value) => Number(value.toPrecision(15));
const SITE_NAMES = { gg: "Grootegeluk", grootegeluk: "Grootegeluk", blf: "Belfast", belfast: "Belfast", med: "Medupi", medupi: "Medupi", "head office": "Head Office" };
const siteName = (value) => SITE_NAMES[String(value || "Belfast").trim().toLowerCase()] || String(value).trim();

function queryText(query, key, fallback = "") {
  if (query[key] == null || query[key] === "") return fallback;
  if (typeof query[key] !== "string") throw invalid(`${key === "machine" ? "Machine" : "Site"} must be a single value.`);
  return query[key].trim();
}

function sumEntries(entries) {
  return entries.reduce((sum, row) => {
    for (const key of ["hours", "downtime", "standby", "pm"]) sum[key] = rounded(sum[key] + row[key]);
    if (row.date) { sum.datedHours = rounded(sum.datedHours + row.hours); sum.datedCount += 1; }
    else { sum.undatedHours = rounded(sum.undatedHours + row.hours); sum.undatedCount += 1; }
    sum.total = sum.hours;
    sum.entryCount += 1;
    return sum;
  }, { hours: 0, total: 0, downtime: 0, standby: 0, pm: 0, datedHours: 0, undatedHours: 0, entryCount: 0, datedCount: 0, undatedCount: 0 });
}

export function buildMachineHours({ daily = [], legacy = [], equipment = [] }, query = {}) {
  const range = dateRange(query);
  const selectedMachine = machineReference(queryText(query, "machine"));
  const selectedSite = siteName(queryText(query, "site", "Belfast"));
  const allSites = ["all", "all sites"].includes(selectedSite.toLowerCase());
  if (!allSites && !Object.values(SITE_NAMES).includes(selectedSite)) throw invalid("Choose a valid site.");
  const units = new Map(equipment.map((row) => [machineIdentity(row.fleet_no ?? row.fleetNo), row]));
  function entry(row, source) {
    const machine = machineReference(row.machine);
    const unit = units.get(machineIdentity(machine));
    const date = calendarDate(row.work_date ?? row.workDate ?? row.date);
    const site = source === "daily" ? "Belfast" : siteName(row.site);
    const machineKey = `${site}:${machineIdentity(machine)}`;
    const hours = amount(source === "daily" ? row.total : row.hours);
    return {
      id: row.id, recordKey: `${source}:${row.id}`, source,
      editPath: `/production/${source === "daily" ? "blf-daily" : "hours"}/${encodeURIComponent(row.id)}`,
      date, workDate: date, isUndated: !date, originalDate: row.work_date ?? row.workDate ?? row.date ?? null,
      machine, machineKey, equipment: row.equipment || unit?.equipment || "", category: unit?.category || "",
      site, opening: source === "daily" ? row.opening ?? null : null,
      closing: source === "daily" ? row.closing ?? null : null,
      hours, total: hours, downtime: amount(row.downtime), standby: amount(row.standby), pm: amount(row.pm),
      status: row.status || unit?.status || "Captured", notes: row.notes || row.remarks || "", remarks: row.remarks || row.notes || "",
    };
  }
  const candidates = [...daily.map((row) => entry(row, "daily")), ...legacy.map((row) => entry(row, "legacy"))]
    .filter((row) => (allSites || row.site === selectedSite) && (!selectedMachine || machineIdentity(row.machine) === machineIdentity(selectedMachine)));
  const undatedCount = candidates.filter((row) => !row.date).length;
  const entries = candidates.filter((row) => inDateRange(row.date, range))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || a.machine.localeCompare(b.machine) || a.recordKey.localeCompare(b.recordKey));
  const groups = new Map();
  for (const row of entries) {
    if (!groups.has(row.machineKey)) groups.set(row.machineKey, []);
    groups.get(row.machineKey).push(row);
  }
  const machines = [...groups].map(([machineKey, rows]) => {
    const dated = rows.map((row) => row.date).filter(Boolean).sort();
    return {
      id: machineKey, machineKey, machine: rows[0].machine, equipment: rows.find((row) => row.equipment)?.equipment || "",
      site: rows[0].site, category: rows.find((row) => row.category)?.category || "",
      ...sumEntries(rows), firstDate: dated[0] || null, lastDate: dated.at(-1) || null,
      status: rows[0].status,
    };
  }).sort((a, b) => a.machine.localeCompare(b.machine) || a.site.localeCompare(b.site));
  return {
    machines, entries, totals: sumEntries(entries), undatedCount,
    excludedUndatedCount: range.from || range.to ? undatedCount : 0,
    filters: { ...range, machine: selectedMachine || null, site: allSites ? "All sites" : selectedSite },
  };
}

export async function getMachineHours(query = {}) {
  // Validate filters before starting any data access.
  dateRange(query);
  const [daily, legacy, equipment] = await Promise.all([
    readTable("production_blf_daily", ref.productionBlfDaily),
    readTable("machine_hours", catalog.machineHoursBlf),
    readTable("equipment", catalog.equipment),
  ]);
  return buildMachineHours({ daily, legacy, equipment }, query);
}
