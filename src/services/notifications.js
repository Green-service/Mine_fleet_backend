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

  await Promise.all([
    recordNotification({ title, detail, kind, unread: true }),
    recordActivity({ actor: actorName, action: activityAction, kind }),
  ]);
}

export async function notifyAllUsers() {
  return 0;
}
