export function invalid(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function label(key) {
  const value = key.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function numberValue(value, name = "Value", { min = 0, max = Infinity, fallback = 0 } = {}) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "number" && typeof value !== "string") throw invalid(`${name} must be a number.`);
  const numeric = Number(typeof value === "string" ? value.trim() : value);
  if (!Number.isFinite(numeric)) throw invalid(`${name} must be a valid number.`);
  if (numeric < min || numeric > max) throw invalid(`${name} must be ${max === Infinity ? `${min} or more` : `between ${min} and ${max}`}.`);
  return numeric;
}

export function isoDate(value, name = "Date", { required = true } = {}) {
  if (value === undefined || value === null || String(value).trim() === "") {
    if (!required) return null;
    throw invalid(`${name} is required.`);
  }
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/);
  let year, month, day;
  if (match) [, year, month, day] = match;
  else {
    match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (match) [, day, month, year] = match;
    else {
      match = text.match(/^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})$/i);
      if (match) {
        day = match[1]; year = match[3];
        month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(match[2].toLowerCase()) + 1;
      }
    }
  }
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (!year || Number(year) < 1900 || Number(year) > 9999 || date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) {
    throw invalid(`${name} must be a valid calendar date.`);
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const RULES = {
  production_shifts: { required: ["work_date", "site", "shift"], numbers: ["target", "actual"], dates: ["work_date"] },
  machine_hours: { required: ["machine"], numbers: ["hours", "downtime", "standby", "pm"], dates: ["work_date"] },
  production_gg_daily: { required: ["work_date"], numbers: ["target", "actual", "product_loader", "sscc", "pci", "sn_ss2", "p2c_ss2_be", "buffalo_loader", "screen", "total"], dates: ["work_date"] },
  production_gg_week: { required: ["week"], numbers: ["product_loader", "sscc", "pci", "sn_ss2", "p2c_ss2_be", "buffalo_loader", "screen", "total"] },
  production_forecast_daily: { required: ["work_date"], numbers: ["product_loading", "sscc", "pci", "gg78", "sn_ss2", "psc_bf", "buffalo_feeder", "screening", "total"], dates: ["work_date"] },
  production_blf_daily: { required: ["work_date", "machine"], numbers: ["opening", "closing", "total", "downtime", "standby", "pm"], dates: ["work_date"] },
  equipment: { required: ["fleet_no", "equipment", "site"], numbers: ["hours", "health"] },
  diesel_transactions: { required: ["work_date", "machine", "site"], numbers: ["opening", "closing", "litres", "total_cost"], dates: ["work_date"], times: ["work_time"] },
  diesel_issues: { numbers: ["litres", "odometer_km", "cost", "opening_meter", "closing_meter"], dates: ["work_date"], times: ["issue_time"] },
  diesel_reconciliations: { required: ["work_date"], dates: ["work_date"] },
  work_orders: { required: ["machine", "task"], dates: ["work_date"] },
  attention_machines: { required: ["fleet_no"] },
  service_plans: { required: ["fleet_no"], numbers: ["hours", "next_service"], dates: ["due_date"] },
  maintenance_backlog: { required: ["fleet", "defect"], dates: ["planned_start"] },
  breakdowns_inventory: { required: ["site"] },
  safety_individual_actions: { required: ["action"], dates: ["start_date", "due_date"] },
  hr_action_tracker: { required: ["action", "person"], dates: ["start_date", "due_date"] },
  finance_action_tracker: { required: ["action", "person"], dates: ["start_date", "due_date"] },
  safety_vfl_observations: { dates: ["observed_date"], times: ["observed_time"] },
  employees: { required: ["full_name", "employee_no"], numbers: ["hourly_rate", "salary"] },
  leave_requests: { required: ["employee"], numbers: ["days"], dates: ["from_date", "to_date"] },
  claims: { required: ["employee"], numbers: ["amount"] },
  hr_manpower: { required: ["area"], numbers: ["budget", "actual", "reliefs"] },
  hr_recruitment: { required: ["site"] },
  hr_increases: { required: ["employee"], dates: ["work_date"] },
  hr_promotions: { required: ["employee"], dates: ["work_date"] },
  hr_disciplinary: { required: ["employee"], dates: ["work_date"] },
  hr_ccma: { required: ["referral"], dates: ["work_date"] },
  purchase_orders: { required: ["supplier"], numbers: ["exclusive", "vat", "total"], dates: ["order_date", "delivery_date"] },
  purchase_requests: { required: ["item"], numbers: ["value"] },
  machine_costs: { required: ["machine"], numbers: ["total"] },
  finance_cost_actions: { required: ["action", "owner"] },
  assets: { numbers: ["purchase_cost"] },
  asset_logs: { numbers: ["income", "deductions"], dates: ["period_start"] },
};

const ALIASES = {
  date: "work_date", workDate: "work_date", time: "work_time", rate: "hourly_rate", totalCost: "total_cost",
  productLoading: "product_loading", productLoader: "product_loader", snSs2: "sn_ss2", pscBf: "psc_bf",
  p2cSs2Be: "p2c_ss2_be", buffaloLoader: "buffalo_loader", buffaloFeeder: "buffalo_feeder",
  currentHours: "current_hours", lastServiceHours: "last_service_hours", serviceInterval: "service_interval", nextServiceHours: "next_service_hours",
};

// Check form numbers before mappers can convert an invalid string into zero.
export function validateInput(table, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalid("Submit a record with named fields.");
  const rules = RULES[table] || {};
  for (const [key, value] of Object.entries(input)) {
    const column = ALIASES[key] || key;
    if (rules.numbers?.includes(column)) numberValue(value, label(key));
  }
  return input;
}

export function validatePayload(table, input, { partial = false } = {}) {
  validateInput(table, input);
  const row = { ...input };
  const rules = RULES[table] || {};
  for (const key of rules.required || []) {
    if ((!partial || key in row) && (row[key] == null || !String(row[key]).trim())) throw invalid(`${label(key)} is required.`);
  }
  for (const key of rules.numbers || []) {
    if (row[key] != null) row[key] = numberValue(row[key], label(key));
  }
  for (const key of rules.dates || []) {
    if (key in row) row[key] = isoDate(row[key], label(key), { required: Boolean(rules.required?.includes(key)) });
  }
  for (const key of rules.times || []) {
    if (row[key] && !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(row[key])) throw invalid(`${label(key)} must be a valid time.`);
  }
  if (row.health != null && Number(row.health) > 100) throw invalid("Health must be between 0 and 100.");
  if (row.opening != null && row.closing != null && Number(row.closing) < Number(row.opening)) throw invalid("Closing meter must be greater than or equal to opening meter.");
  if (row.from_date && row.to_date && row.to_date < row.from_date) throw invalid("Leave end date must be on or after the start date.");
  if (row.start_date && row.due_date && row.due_date < row.start_date) throw invalid("Due date must be on or after the start date.");
  return row;
}
