import { env } from "../config/env.js";
import { sessionUser } from "../data/catalog.js";
import { recordActivity, recordNotification } from "./inboxService.js";
import { listHubUsers } from "./inviteService.js";
import { buildNotificationEmailHtml, buildNotificationEmailText } from "./mailTemplates.js";
import { sendOpsEmail } from "./mail.js";

export async function recordSystemEvent({
  title,
  detail = "",
  kind = "general",
  actor = null,
  action = null,
  module = "BRAINSTAK",
  emailSubject = null,
  emailMessage = null,
  ctaPath = "",
}) {
  const actorName = actor?.name || actor || "System";
  const activityAction = action || detail || title;

  await Promise.all([
    recordNotification({ title, detail, kind, unread: true }),
    recordActivity({ actor: actorName, action: activityAction, kind }),
  ]);

  const message = emailMessage || [detail, activityAction].filter(Boolean).join("\n\n");
  const html = buildNotificationEmailHtml({
    title,
    message,
    actor: actorName,
    action: action || "made a change",
    module,
    ctaUrl: ctaPath ? `${env.clientOrigin}${ctaPath}` : env.clientOrigin,
  });

  await notifyAdmin({
    subject: emailSubject || title,
    message: buildNotificationEmailText({ title, message, actor: actorName, action: action || "made a change" }),
    html,
  });
}

export async function notifyAllUsers({ subject, message, html }) {
  const recipients = listHubUsers().filter((row) => row.email && row.status !== "Revoked");
  const results = await Promise.all(
    recipients.map((row) =>
      sendOpsEmail({
        to: row.email,
        toName: row.name,
        title: subject,
        subject,
        message,
        html,
      }),
    ),
  );
  return results.filter(Boolean).length;
}

export async function notifyAdmin({ subject, message, html }) {
  if (!env.demoEmail) return false;
  return sendOpsEmail({
    to: env.demoEmail,
    toName: sessionUser.name || "Admin",
    title: subject,
    subject,
    message,
    html,
  });
}
