import { getFleet } from "./fleetService.js";
import { getDiesel } from "./dieselService.js";
import { getBoard } from "./productionService.js";
import { getSafety } from "./safetyService.js";
import { getMaintenance } from "./maintenanceService.js";
import { getProcurement } from "./procurementService.js";
import { getFinance } from "./financeService.js";
import { getBreakdowns } from "./breakdownsService.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SITES = ["Grootegeluk", "Belfast", "Medupi", "Head Office"];

function num(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function monthKey(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const month = Number(key.split("-")[1]);
  return MONTHS[month - 1] || key;
}

function buildTrend(rows, dateKey, valueFn) {
  const totals = new Map();
  for (const row of rows) {
    const key = monthKey(row[dateKey]);
    if (!key) continue;
    totals.set(key, (totals.get(key) || 0) + valueFn(row));
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([key, value]) => ({ month: monthLabel(key), value: Number(value.toFixed(1)) }));
}

function toneFor(value, good, warn) {
  if (value >= good) return "good";
  if (value >= warn) return "warn";
  return "bad";
}

function isDown(status) {
  return ["Breakdown", "Maintenance", "Standby"].includes(status);
}

export async function getOverview() {
  const [fleet, diesel, board, safety, maintenance, procurement, finance, breakdowns] = await Promise.all([
    getFleet(),
    getDiesel(),
    getBoard(),
    getSafety(),
    getMaintenance(),
    getProcurement(),
    getFinance(),
    getBreakdowns(),
  ]);

  const equipment = fleet.equipment;
  const total = equipment.length;
  const down = equipment.filter((row) => isDown(row.status));
  const availability = total ? Number((((total - down.length) / total) * 100).toFixed(1)) : 0;
  const avgHealth = total ? Number((equipment.reduce((sum, row) => sum + num(row.health), 0) / total).toFixed(1)) : 0;

  const overduePlan = maintenance.servicePlan.filter((row) => row.status === "Overdue").length;
  const pmCompliance = maintenance.servicePlan.length
    ? Number((((maintenance.servicePlan.length - overduePlan) / maintenance.servicePlan.length) * 100).toFixed(0))
    : 100;

  const openRequests = procurement.requests.filter((row) => row.status === "Awaiting Approval").length;

  const kpis = [
    {
      key: "availability",
      label: "Fleet availability",
      value: `${availability}%`,
      hint: total ? `${down.length} unit${down.length === 1 ? "" : "s"} off the board` : "No units on the register yet",
      tone: total ? toneFor(availability, 90, 80) : "warn",
    },
    {
      key: "utilisation",
      label: "Fleet utilisation",
      value: `${avgHealth}%`,
      hint: "Average condition score across the fleet",
      tone: total ? toneFor(avgHealth, 80, 60) : "warn",
    },
    {
      key: "down",
      label: "Machines down",
      value: String(down.length),
      hint: down.length ? down.slice(0, 2).map((row) => row.fleetNo).join(" · ") : "All units accounted for",
      tone: down.length ? "bad" : "good",
    },
    {
      key: "production",
      label: "Production today",
      value: `${Math.round(board.summary.dailyActual).toLocaleString("en-ZA")} t`,
      hint: board.summary.dailyTarget
        ? `${Math.round((board.summary.dailyActual / board.summary.dailyTarget) * 100)}% of target`
        : "No shifts captured today",
      tone: board.summary.dailyTarget && board.summary.dailyActual >= board.summary.dailyTarget ? "good" : "warn",
    },
    {
      key: "pm",
      label: "PM compliance",
      value: `${pmCompliance}%`,
      hint: `${overduePlan} service${overduePlan === 1 ? "" : "s"} overdue`,
      tone: toneFor(pmCompliance, 90, 75),
    },
    {
      key: "safety",
      label: "Open safety actions",
      value: String(safety.kpis.openActions),
      hint: safety.kpis.hints.openActions,
      tone: safety.kpis.overdueActions ? "warn" : "good",
    },
    {
      key: "spares",
      label: "Critical spares risk",
      value: String(openRequests),
      hint: openRequests ? "Requests awaiting approval" : "No open requests",
      tone: openRequests ? "bad" : "good",
    },
    {
      key: "cost",
      label: "Monthly operating cost",
      value: finance.kpis.monthlyMachine,
      hint: "Machine cost register, month to date",
      tone: "warn",
    },
  ];

  const availabilityTrend = total ? [{ month: MONTHS[new Date().getMonth()], value: availability }] : [];
  const productionTrend = buildTrend(
    board.daily.filter((row) => ["GG", "Medupi"].includes(row.site)),
    "workDate",
    (row) => num(row.actual) / 1000,
  );
  const dieselTrend = buildTrend(diesel.issues, "date", (row) => (num(row.litres) * num(diesel.kpis.costPerLitre)) / 1_000_000);

  const alerts = [];
  for (const item of breakdowns.items.filter((row) => row.severity === "Critical").slice(0, 2)) {
    alerts.push({ id: `breakdown-${item.machine}`, tone: "critical", title: `${item.machine} ${item.failure}`, detail: `${item.status} · ${item.downtime} down · ${item.site}` });
  }
  for (const row of maintenance.servicePlan.filter((row) => row.status === "Overdue").slice(0, 2)) {
    alerts.push({ id: `service-${row.fleetNo}`, tone: "due", title: `${row.fleetNo} service overdue`, detail: row.notes || "Book a workshop slot." });
  }
  for (const row of procurement.requests.filter((row) => row.status === "Awaiting Approval").slice(0, 1)) {
    alerts.push({ id: `pr-${row.request}`, tone: "critical", title: `${row.item || "Purchase request"} awaiting approval`, detail: `${row.request} · ${row.machine || "—"}` });
  }
  if (safety.kpis.overdueActions) {
    alerts.push({ id: "safety-overdue", tone: "safety", title: `${safety.kpis.overdueActions} corrective action${safety.kpis.overdueActions === 1 ? "" : "s"} overdue`, detail: "SHEQ register needs close-out." });
  }

  const sitePulse = SITES.map((site) => {
    const units = equipment.filter((row) => row.site === site);
    const siteDown = units.filter((row) => isDown(row.status));
    const siteAvailability = units.length ? Number((((units.length - siteDown.length) / units.length) * 100).toFixed(0)) : 0;
    const productionCard = site === "Grootegeluk" ? board.summary.gg : site === "Medupi" ? board.summary.medupi : null;
    const productionPct = productionCard ? Math.round(productionCard.pct) : null;
    const status = !units.length ? "No units" : siteAvailability >= 90 ? "Stable" : siteAvailability >= 75 ? "Monitor" : "Attention";
    return {
      site,
      availability: siteAvailability,
      production: productionPct ?? "—",
      diesel: siteDown.length ? `${siteDown.length} down` : "On plan",
      status,
    };
  }).filter((row) => row.status !== "No units");

  return {
    kpis,
    availabilityTrend,
    productionTrend,
    dieselTrend,
    alerts: alerts.slice(0, 6),
    sitePulse,
  };
}
