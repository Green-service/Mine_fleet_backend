import { isoDate } from "./validation.js";

function validDate(value) {
  const date = /^\d{4}-\d{2}-\d{2}T/.test(String(value || "")) ? String(value).slice(0, 10) : value;
  try { return isoDate(date, "Date", { required: false }); } catch { return null; }
}

export function summarizeSafetyMonths(actions, today = new Date().toISOString().slice(0, 10)) {
  const months = new Map();
  for (const action of actions) {
    const date = validDate(action.start || action.start_date) || validDate(action.due || action.due_date) || validDate(action.createdAt || action.created_at);
    const month = date?.slice(0, 7) || "Unscheduled";
    const group = months.get(month) || { id: month, month, scheduled: 0, notStarted: 0, inProgress: 0, completed: 0, na: 0, completedOverdue: 0, overdue: 0, open: 0, closedRate: "0.0%", total: 0 };
    const status = String(action.status || "").toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
    group.total += 1;
    if (["not applicable", "n/a", "na"].includes(status)) group.na += 1;
    else if (status === "completed overdue") group.completedOverdue += 1;
    else if (["completed", "closed"].includes(status)) group.completed += 1;
    else {
      group.open += 1;
      const due = validDate(action.due || action.due_date);
      if (status === "overdue" || (due && due < today)) group.overdue += 1;
      else if (["in progress", "ongoing"].includes(status)) group.inProgress += 1;
      else if (["scheduled", "planned"].includes(status)) group.scheduled += 1;
      else group.notStarted += 1;
    }
    const assessed = group.total - group.na;
    group.closedRate = `${assessed ? (((group.completed + group.completedOverdue) / assessed) * 100).toFixed(1) : "0.0"}%`;
    months.set(month, group);
  }
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
}
