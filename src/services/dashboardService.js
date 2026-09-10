import { fullRegister, getMaintenance } from "./maintenanceService.js";
import { getBreakdowns, listCriticalSpares } from "./breakdownsService.js";
import { getSafety } from "./safetyService.js";
import { getBoard } from "./productionService.js";
import { getFinance } from "./financeService.js";
import { getSettings } from "./settingsService.js";

function num(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function pct(part, whole) {
  return whole ? Number(((part / whole) * 100).toFixed(1)) : null;
}

async function fleetAvailabilityKpi() {
  const [rows, settings] = await Promise.all([fullRegister.list(), getSettings()]);
  const total = rows.length;
  const operational = rows.filter((row) => row.status === "Operational").length;
  const value = pct(operational, total);
  const target = settings.fleetUtilisationTarget;
  return {
    key: "availability",
    label: "Fleet Availability",
    value: value === null ? "—" : `${value}%`,
    hint: total ? `Target ${target}%` : "No machines on the status register",
    tone: value === null ? "navy" : value >= target ? "green" : value >= target - 10 ? "amber" : "red",
  };
}

async function fleetUtilisationKpi() {
  const { machineHoursBlf } = await getBoard();
  const withHours = machineHoursBlf.filter((row) => num(row.hours) + num(row.downtime) + num(row.standby) + num(row.pm) > 0);
  if (!withHours.length) {
    return {
      key: "utilisation",
      label: "Fleet Utilisation",
      value: "—",
      hint: "No machine hours captured yet",
      tone: "navy",
    };
  }
  const avg = withHours.reduce((sum, row) => {
    const denom = num(row.hours) + num(row.downtime) + num(row.standby) + num(row.pm);
    return sum + (denom ? (num(row.hours) / denom) * 100 : 0);
  }, 0) / withHours.length;
  const value = Number(avg.toFixed(1));
  return {
    key: "utilisation",
    label: "Fleet Utilisation",
    value: `${value}%`,
    hint: `Based on ${withHours.length} captured machine${withHours.length === 1 ? "" : "s"}`,
    tone: value >= 80 ? "green" : value >= 60 ? "amber" : "red",
  };
}

async function machinesDownKpi() {
  const [rows, breakdowns] = await Promise.all([fullRegister.list(), getBreakdowns()]);
  const down = rows.filter((row) => row.status && row.status !== "Operational").length;
  const critical = breakdowns.kpis.critical;
  return {
    key: "down",
    label: "Machines Down",
    value: String(down),
    hint: critical ? `${critical} critical breakdown${critical === 1 ? "" : "s"}` : "No critical breakdowns",
    tone: down === 0 ? "green" : critical > 0 ? "red" : "amber",
  };
}

async function productionTodayKpi() {
  const { summary } = await getBoard();
  const actual = num(summary.dailyActual);
  const target = num(summary.dailyTarget);
  const value = pct(actual, target);
  return {
    key: "production",
    label: "Production Today",
    value: actual ? `${Math.round(actual).toLocaleString("en-ZA")} t` : "—",
    hint: target ? `${value}% of target` : actual ? "No target captured" : "No shifts captured today",
    tone: value === null ? "navy" : value >= 100 ? "green" : value >= 90 ? "amber" : "red",
  };
}

async function pmComplianceKpi() {
  const { kpis } = await getMaintenance();
  const value = pct(kpis.inPlan - kpis.overdue, kpis.inPlan);
  return {
    key: "pm",
    label: "PM Compliance",
    value: value === null ? "—" : `${value}%`,
    hint: kpis.inPlan ? `${kpis.dueSoon} service${kpis.dueSoon === 1 ? "" : "s"} due soon` : "No vehicles on the service plan",
    tone: value === null ? "navy" : value >= 90 ? "green" : value >= 75 ? "amber" : "red",
  };
}

async function safetyActionsKpi() {
  const { kpis } = await getSafety();
  return {
    key: "safety",
    label: "Open Safety Actions",
    value: String(kpis.openActions),
    hint: kpis.hints.openActions,
    tone: kpis.overdueActions > 0 ? "red" : kpis.openActions > 0 ? "amber" : "green",
  };
}

async function criticalSparesKpi() {
  const spares = await listCriticalSpares();
  return {
    key: "spares",
    label: "Critical Spares Risk",
    value: String(spares.length),
    hint: "Out of stock / below minimum",
    tone: spares.length === 0 ? "green" : spares.length <= 3 ? "amber" : "red",
  };
}

async function operatingCostKpi() {
  const { kpis } = await getFinance();
  return {
    key: "opex",
    label: "Monthly Operating Cost",
    value: kpis.total ? kpis.monthlyMachine : "—",
    hint: kpis.total ? "Sum of captured machine costs" : "No machine costs captured yet",
    tone: "navy",
  };
}

export async function getDashboardKpis() {
  const kpis = await Promise.all([
    fleetAvailabilityKpi(),
    fleetUtilisationKpi(),
    machinesDownKpi(),
    productionTodayKpi(),
    pmComplianceKpi(),
    safetyActionsKpi(),
    criticalSparesKpi(),
    operatingCostKpi(),
  ]);
  return { kpis };
}

export async function getPriorityAlerts() {
  const [breakdowns, spares, maintenance, safety, board] = await Promise.all([
    getBreakdowns(),
    listCriticalSpares(),
    getMaintenance(),
    getSafety(),
    getBoard(),
  ]);

  const alerts = [];

  breakdowns.items
    .filter((row) => row.severity === "Critical")
    .forEach((row) => alerts.push({ tone: "red", label: "Critical", text: `${row.machine} ${row.failure}`.trim() }));

  spares
    .filter((row) => row.status === "Required")
    .forEach((row) => alerts.push({ tone: "red", label: "Critical", text: `${row.item} out of stock` }));

  maintenance.attention
    .filter((row) => row.status === "Due Soon")
    .forEach((row) => alerts.push({ tone: "amber", label: "Due Soon", text: `${row.fleetNo} — ${row.reason}` }));

  if (safety.kpis.overdueActions > 0) {
    alerts.push({
      tone: "amber",
      label: "Safety",
      text: `${safety.kpis.overdueActions} corrective action${safety.kpis.overdueActions === 1 ? "" : "s"} overdue`,
    });
  }

  [board.summary.gg, board.summary.medupi].forEach((site) => {
    if (site.mtdTarget && site.pct < 100) {
      alerts.push({ tone: "blue", label: "Production", text: site.note });
    }
  });

  return { alerts: alerts.slice(0, 8) };
}
