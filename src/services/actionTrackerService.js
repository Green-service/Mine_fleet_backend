import { randomUUID } from "node:crypto";
import { makeCollection, optStr, str } from "./collectionService.js";
import { invalid, isoDate } from "./validation.js";

export const ACTION_STATUSES = ["Completed", "Completed Overdue", "In Progress", "Overdue", "Not Yet Assessed", "Scheduled", "Not Applicable"];

function actionRow(row) {
  return { ...row, function: row.function_area, start: row.start_date, due: row.due_date, createdAt: row.created_at };
}

export function createActionTracker(table, prefix) {
  return makeCollection(table, [], {
    toRow: actionRow,
    toPayload(input, previous = {}) {
      const action = str(input.action, previous.action);
      const person = str(input.person, previous.person);
      if (!action) throw invalid("Describe the action to be taken.");
      if (!person) throw invalid("Enter the responsible person.");
      const status = str(input.status, previous.status || "Not Yet Assessed");
      if (!ACTION_STATUSES.includes(status)) throw invalid("Choose a valid action status.");
      return {
        ref: previous.ref || `${prefix}-${randomUUID().toUpperCase()}`,
        person, action, status,
        section: optStr(input.section, previous.section),
        location: optStr(input.location, previous.location),
        function_area: optStr(input.function, previous.function),
        source: optStr(input.source, previous.source),
        finding: optStr(input.finding, previous.finding),
        type: optStr(input.type, previous.type),
        category: optStr(input.category, previous.category),
        start_date: isoDate(input.start ?? previous.start ?? (previous.id ? "" : new Date()), "Start date", { required: false }),
        due_date: isoDate(input.due ?? previous.due, "Due date", { required: false }),
        evidence: optStr(input.evidence, previous.evidence),
        verified: optStr(input.verified, previous.verified),
      };
    },
  });
}
