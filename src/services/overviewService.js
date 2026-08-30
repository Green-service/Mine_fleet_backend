import { getBoard } from "./productionService.js";
import { getFleet } from "./fleetService.js";
import { getDiesel } from "./dieselService.js";
import { getBreakdowns } from "./breakdownsService.js";
import { getSafety } from "./safetyService.js";
import { getMaintenance } from "./maintenanceService.js";
import { getFinance } from "./financeService.js";
import { getProcurement } from "./procurementService.js";
import { getSettings } from "./settingsService.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOWN_STATUSES = new Set(["Breakdown", "Maintenance", "Standby", "Unavailable"]);

function num(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function monthKey(date) {
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function lastSixMonths(asOf = new Date()) {
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(asOf.getFullYear(), asOf.getMonth() - (5 - index), 1);
    return {
      month: MONTHS[date.getMonth()],
      key: monthKey(date),
      year: date.getFullYear(),
    };
  });
}

function compactMoney(value) {
  const n = num(value);
  if (!n) return "R 0";
  if (n >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  if (n >= 1_000) return `R${Math.round(n / 1000)}k`;
  return `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatTonnes(value) {
  return `${num(value).toLocaleString("en-ZA")} t`;
}

function formatPct(value, digits = 1) {
  return `${num(value).toFixed(digits)}%`;
}

function fleetAvailability(units) {
  if (!units.length) return 0;
  const up = units.filter((row) => !DOWN_STATUSES.has(row.status)).length;
  return Number(((up / units.length) * 100).toFixed(1));
}

function fleetUtilisation(units) {
  if (!units.length) return 0;
  const avgHealth = units.reduce((sum, row) => sum + num(row.health), 0) / units.length;
  return Number(avgHealth.toFixed(1));
}

function aggregateProductionByMonth(daily, months) {
  const buckets = Object.fromEntries(months.map((item) => [item.key, 0]));
  for (const row of daily) {
    const date = parseDate(row.workDate || row.date);
    const key = monthKey(date);
    if (key in buckets) buckets[key] += num(row.actual);
  }
  return months.map((item) => ({
    month: item.month,
    value: Number((buckets[item.key] / 1000).toFixed(1)),
  }));
}

function aggregateDieselByMonth(issues, months, costPerLitre) {
  const buckets = Object.fromEntries(months.map((item) => [item.key, 0]));
  for (const row of issues) {
    const date = parseDate(row.workDate || row.date);
    const key = monthKey(date);
    if (key in buckets) buckets[key] += num(row.litres) * num(costPerLitre);
  }
  return months.map((item) => ({
    month: item.month,
    value: Number((buckets[item.key] / 1_000_000).toFixed(2)),
  }));
}

function availabilityTrend(units, months, asOf) {
  const current = fleetAvailability(units);
  return months.map((item) => ({
    month: item.month,
    value: item.key === monthKey(asOf) && units.length ? current : 0,
  }));
}

function toneForAvailability(value, target) {
  if (!value) return "warn";
  if (value >= target) return "good";
  if (value >= target - 5) return "warn";
  return "bad";
}

function buildKpis({ settings, fleet, production, breakdowns, maintenance, safety, procurement, finance, diesel }) {
  const units = fleet.equipment || [];
  const target = num(settings.availabilityTarget) || 90;
  const availability = fleetAvailability(units);
  const utilisation = fleetUtilisation(units);
  const machinesDown = units.filter((row) => DOWN_STATUSES.has(row.status)).length;
  const criticalBreakdowns = (breakdowns.items || []).filter((row) => row.severity === "Critical").length;
  const dailyActual = num(production.summary?.dailyActual);
  const dailyTarget = num(production.summary?.dailyTarget);
  const productionPct = dailyTarget ? Math.round((dailyActual / dailyTarget) * 100) : 0;
  const workOrders = maintenance.workOrders || [];
  const closedOrders = workOrders.filter((row) => row.status === "Closed").length;
  const pmCompliance = workOrders.length ? Math.round((closedOrders / workOrders.length) * 100) : 0;
  const dueSoon = workOrders.filter((row) => ["Planned", "Scheduled", "Open"].includes(row.status)).length;
  const openSafety = num(safety.kpis?.openActions);
  const overdueSafety = num(safety.kpis?.overdueActions);
  const sparesRisk = (procurement.requests || []).filter((row) => row.status === "Awaiting Approval").length;
  const monthlyCost = num(finance.kpis?.total) + num(diesel.kpis?.monthlySpend);

  return [
    {
      key: "availability",
      label: "Fleet availability",
      value: units.length ? formatPct(availability) : "—",
      hint: units.length ? `Target ${target}%` : "Add fleet units to calculate",
      tone: units.length ? toneForAvailability(availability, target) : "warn",
    },
    {
      key: "utilisation",
      label: "Fleet utilisation",
      value: units.length ? formatPct(utilisation) : "—",
      hint: units.length ? "Average health on register" : "No fleet units captured",
      tone: utilisation >= 70 ? "good" : "warn",
    },
    {
      key: "down",
      label: "Machines down",
      value: String(machinesDown || breakdowns.kpis?.open || 0),
      hint: criticalBreakdowns ? `${criticalBreakdowns} critical breakdowns` : machinesDown ? "On breakdown register" : "No machines down",
      tone: machinesDown || criticalBreakdowns ? "bad" : "good",
    },
    {
      key: "production",
      label: "Production today",
      value: dailyActual ? formatTonnes(dailyActual) : "0 t",
      hint: dailyTarget ? `${productionPct}% of target` : "Capture a shift to start",
      tone: productionPct >= 100 ? "good" : dailyActual ? "warn" : "warn",
    },
    {
      key: "pm",
      label: "PM compliance",
      value: workOrders.length ? formatPct(pmCompliance, 0) : "—",
      hint: workOrders.length ? `${dueSoon} services open` : "No work orders captured",
      tone: pmCompliance >= 90 ? "good" : workOrders.length ? "warn" : "warn",
    },
    {
      key: "safety",
      label: "Open safety actions",
      value: String(openSafety),
      hint: overdueSafety ? `${overdueSafety} overdue` : openSafety ? "SHEQ tracker" : "No open actions",
      tone: overdueSafety ? "bad" : openSafety ? "warn" : "good",
    },
    {
      key: "spares",
      label: "Critical spares risk",
      value: String(sparesRisk),
      hint: sparesRisk ? "Awaiting approval on PRs" : "No procurement holds",
      tone: sparesRisk ? "bad" : "good",
    },
    {
      key: "cost",
      label: "Monthly operating cost",
      value: compactMoney(monthlyCost),
      hint: monthlyCost ? "Machine cost + diesel MTD" : "Capture costs to calculate",
      tone: monthlyCost ? "warn" : "warn",
    },
  ];
}

function buildAlerts({ breakdowns, procurement, maintenance, safety, production }) {
  const alerts = [];

  for (const row of breakdowns.items || []) {
    alerts.push({
      id: `bd-${row.id}`,
      tone: row.severity === "Critical" ? "critical" : "due",
      title: `${row.machine} ${row.failure}`,
      detail: `${row.downtime} · ${row.site}`,
    });
  }

  for (const row of (procurement.requests || []).filter((item) => item.status === "Awaiting Approval").slice(0, 2)) {
    alerts.push({
      id: `pr-${row.id || row.request}`,
      tone: "critical",
      title: row.item,
      detail: `${row.request} awaiting approval · ${row.machine}`,
    });
  }

  for (const row of (maintenance.workOrders || []).filter((item) => item.status === "Overdue").slice(0, 2)) {
    alerts.push({
      id: `wo-${row.id}`,
      tone: "due",
      title: `${row.machine} service overdue`,
      detail: row.task,
    });
  }

  for (const row of (safety.actions || []).filter((item) => item.status === "Overdue").slice(0, 2)) {
    alerts.push({
      id: `sa-${row.id}`,
      tone: "safety",
      title: row.action,
      detail: `${row.owner} · ${row.due}`,
    });
  }

  const med = production.summary?.medupi;
  if (med?.mtdTarget && med.pct < 100) {
    alerts.push({
      id: "prod-medupi",
      tone: "production",
      title: "Medupi below MTD target",
      detail: `${Math.round(med.mtdActual).toLocaleString("en-ZA")} t of ${Math.round(med.mtdTarget).toLocaleString("en-ZA")} t`,
    });
  }

  return alerts.slice(0, 6);
}

function buildSitePulse(units, production) {
  const sites = [
    { site: "Grootegeluk", productionKey: "gg" },
    { site: "Belfast", productionKey: null },
    { site: "Medupi", productionKey: "medupi" },
  ];

  return sites.map(({ site, productionKey }) => {
    const siteUnits = units.filter((row) => row.site === site);
    const availability = fleetAvailability(siteUnits);
    const productionCard = productionKey ? production.summary?.[productionKey] : null;
    const productionPct = productionCard ? Math.round(productionCard.pct || 0) : 0;
    const hasData = siteUnits.length || productionCard?.mtdActual;
    return {
      site,
      availability,
      production: productionPct,
      diesel: siteUnits.length ? "Tracked" : "—",
      status: !hasData ? "No data" : availability >= 90 ? "Stable" : availability >= 75 ? "Monitor" : "Attention",
    };
  });
}

export async function getOverview() {
  const asOf = new Date();
  const months = lastSixMonths(asOf);
  const [
    settings,
    fleet,
    production,
    diesel,
    breakdowns,
    safety,
    maintenance,
    finance,
    procurement,
  ] = await Promise.all([
    getSettings(),
    getFleet(),
    getBoard(),
    getDiesel(),
    getBreakdowns(),
    getSafety(),
    getMaintenance(),
    getFinance(),
    getProcurement(),
  ]);

  const units = fleet.equipment || [];
  const daily = production.daily || [];
  const issues = diesel.issues || [];

  return {
    kpis: buildKpis({ settings, fleet, production, breakdowns, maintenance, safety, procurement, finance, diesel }),
    availabilityTrend: availabilityTrend(units, months, asOf),
    productionTrend: aggregateProductionByMonth(daily, months),
    dieselTrend: aggregateDieselByMonth(issues, months, settings.dieselCostPerLitre || diesel.kpis?.costPerLitre || 31.65),
    alerts: buildAlerts({ breakdowns, procurement, maintenance, safety, production }),
    sitePulse: buildSitePulse(units, production),
  };
}
