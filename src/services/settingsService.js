import * as catalog from "../data/catalog.js";
import { readTable, updateRow } from "./store.js";

const DEFAULTS = {
  id: "default",
  default_site: "Grootegeluk",
  diesel_cost_per_litre: 31.65,
  availability_target: 90,
};

function toSettings(row) {
  return {
    defaultSite: row.default_site || row.defaultSite || DEFAULTS.default_site,
    dieselCostPerLitre: Number(row.diesel_cost_per_litre ?? row.dieselCostPerLitre ?? DEFAULTS.diesel_cost_per_litre),
    availabilityTarget: Number(row.availability_target ?? row.availabilityTarget ?? DEFAULTS.availability_target),
  };
}

function fromPatch(body, previous) {
  return {
    default_site: String(body.defaultSite ?? previous.default_site ?? DEFAULTS.default_site).trim(),
    diesel_cost_per_litre: Number(body.dieselCostPerLitre ?? previous.diesel_cost_per_litre ?? DEFAULTS.diesel_cost_per_litre),
    availability_target: Number(body.availabilityTarget ?? previous.availability_target ?? DEFAULTS.availability_target),
  };
}

async function readSettingsRow() {
  const rows = await readTable("app_settings", [catalog.appSettings]);
  return rows[0] || catalog.appSettings;
}

export async function getSettings() {
  return toSettings(await readSettingsRow());
}

export async function patchSettings(body) {
  const current = await readSettingsRow();
  const payload = fromPatch(body || {}, current);
  if (!payload.default_site) {
    const err = new Error("Default site is required.");
    err.status = 400;
    throw err;
  }
  const saved = await updateRow("app_settings", current.id || "default", payload, [catalog.appSettings]);
  Object.assign(catalog.appSettings, saved);
  return toSettings({ ...current, ...saved, ...payload });
}
