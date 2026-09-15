import * as catalog from "../data/catalog.js";
import { insertRow, readTable, updateRow } from "./store.js";
import { numberValue } from "./validation.js";

const DEFAULTS = {
  id: "default",
  default_site: "",
  diesel_cost_per_litre: 23.45,
  fleet_utilisation_target: 90,
};

function toSettings(row) {
  return {
    defaultBusiness: row.default_site || row.defaultSite || row.defaultBusiness || DEFAULTS.default_site,
    dieselCostPerLitre: Number(row.diesel_cost_per_litre ?? row.dieselCostPerLitre ?? DEFAULTS.diesel_cost_per_litre),
    fleetUtilisationTarget: Number(
      row.fleet_utilisation_target
      ?? row.fleetUtilisationTarget
      ?? row.availability_target
      ?? row.availabilityTarget
      ?? DEFAULTS.fleet_utilisation_target,
    ),
  };
}

function fromPatch(body, previous) {
  return {
    default_site: String(body.defaultBusiness ?? body.defaultSite ?? previous.default_site ?? DEFAULTS.default_site).trim(),
    diesel_cost_per_litre: numberValue(body.dieselCostPerLitre ?? previous.diesel_cost_per_litre ?? DEFAULTS.diesel_cost_per_litre, "Diesel cost per litre"),
    availability_target: numberValue(body.fleetUtilisationTarget ?? body.availabilityTarget ?? previous.availability_target ?? DEFAULTS.fleet_utilisation_target, "Fleet utilisation target", { max: 100 }),
    updated_at: new Date().toISOString(),
  };
}

async function readSettingsRow() {
  const rows = await readTable("app_settings", [catalog.appSettings]);
  return rows[0] || null;
}

export async function getSettings() {
  return toSettings(await readSettingsRow() || catalog.appSettings);
}

export async function patchSettings(body) {
  const current = await readSettingsRow();
  const payload = fromPatch(body || {}, current || DEFAULTS);
  if (!payload.default_site) {
    const err = new Error("Default business is required.");
    err.status = 400;
    throw err;
  }
  const saved = current
    ? await updateRow("app_settings", current.id || "default", payload, [catalog.appSettings])
    : await insertRow("app_settings", { id: "default", ...payload }, [catalog.appSettings]);
  Object.assign(catalog.appSettings, saved);
  return toSettings({ ...current, ...saved, ...payload });
}
