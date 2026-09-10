import * as catalog from "../data/catalog.js";
import * as ref from "../data/referenceCatalog.js";
import { recordSystemEvent } from "./notifications.js";
import { deleteRow, insertRow, readTable, updateRow } from "./store.js";
import { makeCollection, optStr, str } from "./collectionService.js";

function toAction(row) {
  return {
    id: row.id,
    source: row.source || "Incident",
    action: row.action || "",
    owner: row.owner || "SHEQ Department",
    due: row.due_label || row.due || "Open",
    status: row.status || "Open",
    priority: row.priority || "Medium",
  };
}

function persistAction(input, previous = {}) {
  const action = String(input.action || input.description || previous.action || "").trim();
  if (!action) {
    const err = new Error("Describe the action or incident.");
    err.status = 400;
    throw err;
  }
  return {
    source: String(input.source || previous.source || "Incident").trim(),
    action,
    owner: String(input.owner || previous.owner || "SHEQ Department").trim(),
    due_label: String(input.due || input.due_label || previous.due_label || previous.due || "Open").trim(),
    status: String(input.status || previous.status || "Open").trim(),
    priority: String(input.priority || input.severity || previous.priority || "Medium").trim(),
  };
}

async function readActions() {
  const rows = await readTable("safety_actions", catalog.safetyActions);
  return rows.map(toAction);
}

function buildKpis(actions) {
  const open = actions.filter((row) => !["Closed"].includes(row.status));
  const overdue = actions.filter((row) => row.status === "Overdue");
  const ongoing = actions.filter((row) => row.status === "Ongoing");
  return {
    ltiFree: 0,
    scratchFree: 0,
    openHazards: 0,
    openActions: open.length,
    overdueActions: overdue.length,
    training: 0,
    pto: 0,
    riskAssessments: 0,
    jobCards: 0,
    hints: {
      openActions: overdue.length ? `${overdue.length} overdue` : open.length ? `${ongoing.length} ongoing` : "No open actions",
      training: actions.length ? "Capture training records to update compliance" : "No training data captured",
      riskGap: "Capture risk assessments and job cards",
    },
    notes: actions.length
      ? [
          "Every HOD, inspection and incident action lands on one list.",
          "Overdue items stay visible until evidence is uploaded.",
          overdue.length
            ? `${overdue.length} overdue action${overdue.length === 1 ? "" : "s"} need close-out.`
            : "No overdue actions on the register.",
        ]
      : [
          "Every HOD, inspection and incident action lands on one list.",
          "Overdue items stay visible until evidence is uploaded.",
          "Report an incident or add an action to start the register.",
        ],
  };
}

export async function getSafety() {
  const actions = await readActions();
  return { actions, kpis: buildKpis(actions) };
}

export async function reportSafety(body, actor = null) {
  const payload = persistAction(body);
  const saved = await insertRow("safety_actions", payload, catalog.safetyActions);
  const row = toAction({ ...payload, ...saved });
  Object.assign(saved, row);
  await recordSystemEvent({
    title: "SHEQ action logged",
    detail: `${row.source} · ${row.action}`,
    kind: "maintenance",
    actor,
    action: "logged a SHEQ action",
    ctaPath: "/safety",
  });
  return row;
}

export async function updateSafety(id, body, actor = null) {
  const previous = (await readActions()).find((row) => row.id === id);
  if (!previous) {
    const err = new Error("Action not found");
    err.status = 404;
    throw err;
  }
  const payload = persistAction(body, previous);
  const saved = await updateRow("safety_actions", id, payload, catalog.safetyActions);
  const row = toAction({ ...previous, ...payload, ...saved, id });
  Object.assign(saved, row);
  await recordSystemEvent({
    title: "SHEQ action updated",
    detail: row.action,
    kind: "maintenance",
    actor,
    action: "updated a SHEQ action",
    ctaPath: "/safety",
  });
  return row;
}

export async function removeSafety(id, actor = null) {
  const previous = (await readActions()).find((row) => row.id === id);
  await deleteRow("safety_actions", id, catalog.safetyActions);
  if (previous) {
    await recordSystemEvent({
      title: "SHEQ action removed",
      detail: previous.action,
      kind: "maintenance",
      actor,
      action: "removed a SHEQ action",
      ctaPath: "/safety",
    });
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Static/historical registers migrated off local component state
// ---------------------------------------------------------------------------

function performanceRow(row) {
  return { id: row.id, indicator: row.indicator, result: row.result, status: row.status, comment: row.comment };
}
export const performance = makeCollection("safety_performance", ref.safetyPerformance, { toRow: performanceRow });

function monthlyReportRow(row) {
  return {
    id: row.id,
    month: row.month,
    scheduled: row.scheduled,
    notStarted: row.not_started,
    inProgress: row.in_progress,
    completed: row.completed,
    na: row.na,
    completedOverdue: row.completed_overdue,
    overdue: row.overdue,
    open: row.open,
    closedRate: row.closed_rate,
    total: row.total,
  };
}
export const monthlyReport = makeCollection("safety_monthly_report", ref.safetyMonthlyReport, { toRow: monthlyReportRow });

function individualRow(row) {
  return {
    id: row.id,
    ref: row.ref,
    section: row.section,
    location: row.location,
    function: row.function_area,
    source: row.source,
    finding: row.finding,
    action: row.action,
    type: row.type,
    category: row.category,
    start: row.start_date,
    due: row.due_date,
    status: row.status,
    person: row.person,
    evidence: row.evidence,
    verified: row.verified,
  };
}
function individualPayload(input, previous = {}) {
  const action = str(input.action, previous.action);
  if (!action) {
    const err = new Error("Describe the action to be taken.");
    err.status = 400;
    throw err;
  }
  return {
    ref: previous.ref || `SA-${Date.now().toString().slice(-6)}`,
    section: optStr(input.section, previous.section),
    location: optStr(input.location, previous.location),
    function_area: optStr(input.function, previous.function),
    source: optStr(input.source, previous.source),
    finding: optStr(input.finding, previous.finding),
    action,
    type: optStr(input.type, previous.type),
    category: optStr(input.category, previous.category),
    start_date: optStr(input.start, previous.start),
    due_date: optStr(input.due, previous.due),
    status: optStr(input.status, previous.status) || "Not Yet Assessed",
    person: optStr(input.person, previous.person),
    evidence: optStr(input.evidence, previous.evidence),
    verified: optStr(input.verified, previous.verified),
  };
}
export const individualActions = makeCollection("safety_individual_actions", ref.safetyIndividualActions, { toRow: individualRow, toPayload: individualPayload });

// ---------------------------------------------------------------------------
// VFL (Visible Felt Leadership) observations — daily field checklist
// ---------------------------------------------------------------------------

function vflRow(row) {
  return {
    id: row.id,
    submittedById: row.submitted_by_id,
    submittedByName: row.submitted_by_name,
    submittedByEmail: row.submitted_by_email,
    date: row.observed_date,
    time: row.observed_time,
    originator: row.originator,
    activity: row.activity,
    people: row.people_observed,
    department: row.department,
    location: row.location,
    signature: row.signature,
    entries: row.answers || [],
    yesCount: row.yes_count,
    noCount: row.no_count,
    completionPct: row.completion_pct,
    result: row.result_label,
    createdAt: row.created_at,
  };
}

export async function submitVflObservation(body, actor) {
  if (!actor) {
    const err = new Error("Sign in required.");
    err.status = 401;
    throw err;
  }
  const date = str(body.date, "");
  const originator = str(body.originator, "");
  const activity = str(body.activity, "");
  const location = str(body.location, "");
  if (!date || !originator || !activity || !location) {
    const err = new Error("Complete Date, Originator, Activity Observed and Location before submitting.");
    err.status = 400;
    throw err;
  }
  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (!entries.length || entries.some((e) => e.answer !== "Yes" && e.answer !== "No")) {
    const err = new Error("Answer every VFL observation question before submitting.");
    err.status = 400;
    throw err;
  }
  const yesCount = entries.filter((e) => e.answer === "Yes").length;
  const noCount = entries.filter((e) => e.answer === "No").length;
  const resultLabel = noCount === 0 ? "All Yes" : `${noCount} Action Item${noCount === 1 ? "" : "s"}`;

  const payload = {
    submitted_by_id: actor.id,
    submitted_by_name: actor.name,
    submitted_by_email: actor.email,
    observed_date: date,
    observed_time: optStr(body.time, ""),
    originator,
    activity,
    people_observed: optStr(body.people, ""),
    department: optStr(body.department, ""),
    location,
    signature: optStr(body.signature, ""),
    answers: entries,
    yes_count: yesCount,
    no_count: noCount,
    completion_pct: 100,
    result_label: resultLabel,
  };
  const saved = await insertRow("safety_vfl_observations", payload, []);
  const row = vflRow({ ...payload, ...saved });

  await Promise.all(
    entries
      .filter((e) => e.answer === "No")
      .map((e) =>
        individualActions.create({
          person: actor.name,
          source: "VFL Observation",
          finding: e.question,
          action: e.question,
          category: e.category,
          type: "Corrective Action",
          due: "",
          status: "Not Yet Assessed",
        }),
      ),
  );

  await recordSystemEvent({
    title: "VFL observation submitted",
    detail: `${actor.name} — ${activity} (${resultLabel})`,
    kind: "maintenance",
    actor,
    action: "submitted a VFL observation",
    ctaPath: "/safety?register=vfl",
  });

  return row;
}

export async function listVflObservations() {
  const rows = await readTable("safety_vfl_observations", []);
  return rows.map(vflRow).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
