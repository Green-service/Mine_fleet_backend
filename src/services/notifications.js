import { recordActivity, recordNotification } from "./inboxService.js";

export async function recordSystemEvent({
  title,
  detail = "",
  kind = "general",
  actor = null,
  action = null,
}) {
  const actorName = actor?.name || actor || "System";
  const activityAction = action || detail || title;

  const outcomes = await Promise.allSettled([
    recordNotification({ title, detail, kind, unread: true }),
    recordActivity({ actor: actorName, action: activityAction, kind }),
  ]);
  // The domain record has already committed. A missing inbox table must not
  // report that save as failed and encourage duplicate submissions.
  for (const outcome of outcomes) {
    if (outcome.status === "rejected") console.warn(`[inbox] Event could not be recorded: ${outcome.reason?.message || "unknown error"}`);
  }
}

export async function notifyAllUsers() {
  return 0;
}
