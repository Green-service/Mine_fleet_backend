import test from "node:test";
import assert from "node:assert/strict";
import { buildFleetUtilisationKpi } from "./dashboardService.js";
import { buildMachineHours } from "./machineHoursService.js";

test("dashboard utilisation uses dated daily and legacy capture hours from the selected month", () => {
  const report = buildMachineHours({
    daily: [
      { id: "current", machine: "CMPG004", work_date: "2091-02-01", total: 10, downtime: 5 },
      { id: "old", machine: "CMPG004", work_date: "2091-01-31", total: 100, downtime: 0 },
    ],
    legacy: [
      { id: "undated", machine: "CMPG004", site: "Belfast", hours: 900, downtime: 0 },
      { id: "dated", machine: "CMPG044", site: "Grootegeluk", work_date: "2091-02-02", hours: 5, downtime: 0 },
    ],
  }, { site: "All sites", from: "2091-02-01", to: "2091-02-02" });
  const kpi = buildFleetUtilisationKpi(report);
  assert.equal(kpi.value, "75%");
  assert.match(kpi.hint, /Month to date.*2 dated captures/);
  assert.equal(report.excludedUndatedCount, 1);
});

test("dashboard utilisation does not invent a percentage when no dated hours exist", () => {
  const kpi = buildFleetUtilisationKpi({ totals: { hours: 0, downtime: 0, standby: 0, pm: 0, datedCount: 0 } });
  assert.equal(kpi.value, "—");
  assert.match(kpi.hint, /No dated machine hours/);
});
