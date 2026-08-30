import * as catalog from "../data/catalog.js";
import { deleteRow, insertRow, readTable, updateRow } from "./store.js";

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

export async function reportSafety(body) {
  const payload = persistAction(body);
  const saved = await insertRow("safety_actions", payload, catalog.safetyActions);
  const row = toAction({ ...payload, ...saved });
  Object.assign(saved, row);
  return row;
}

export async function updateSafety(id, body) {
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
  return row;
}

export async function removeSafety(id) {
  await deleteRow("safety_actions", id, catalog.safetyActions);
  return { ok: true };
}
