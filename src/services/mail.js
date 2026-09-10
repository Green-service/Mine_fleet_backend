import { env } from "../config/env.js";

import { buildInviteEmailHtml, buildNotificationEmailHtml } from "./mailTemplates.js";

function inviteMessage({ name, email, role, site, password, loginUrl }) {
  return [
    `Good day ${name},`,
    `You have been invited to BRAINSTAK as ${role}${site ? ` at ${site}` : ""}.`,
    `Sign in at ${loginUrl}`,
    `Work email: ${email}`,
    `Temporary password: ${password}`,
    "Ask your administrator to rotate this password after your first sign-in.",
  ].join("\n\n");
}

export async function sendOpsEmail({ to, toName, title, subject, message, html, templateParams = {} }) {
  if (!env.emailjsServiceId || !env.emailjsTemplateId || !env.emailjsPublicKey) {
    console.warn("[mail] EmailJS not configured — skipped:", subject || title);
    return false;
  }

  const emailHtml = html || buildNotificationEmailHtml({ title: title || subject, message, actor: toName || to });

  const body = {
    service_id: env.emailjsServiceId,
    template_id: env.emailjsTemplateId,
    user_id: env.emailjsPublicKey,
    template_params: {
      to_email: to,
      email: to,
      user_email: to,
      to_name: toName || to,
      name: toName || to,
      from_name: "BRAINSTAK",
      reply_to: env.demoEmail,
      title: title || "BRAINSTAK",
      subject: subject || title || "BRAINSTAK",
      message,
      html_message: emailHtml,
      ...templateParams,
    },
  };
  if (env.emailjsPrivateKey) body.accessToken = env.emailjsPrivateKey;

  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: env.clientOrigin,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.warn("[mail] Send failed:", text.replace(/^"|"$/g, "") || res.status);
    return false;
  }
  return true;
}

export async function sendInviteEmail(params) {
  if (!env.emailjsServiceId || !env.emailjsTemplateId || !env.emailjsPublicKey) {
    const err = new Error("Invite email is not configured on the API.");
    err.status = 503;
    throw err;
  }
  const ok = await sendOpsEmail({
    to: params.email,
    toName: params.name,
    title: "BRAINSTAK invite",
    subject: "You've been invited to BRAINSTAK",
    message: inviteMessage(params),
    html: buildInviteEmailHtml(params),
    templateParams: {
      role: params.role,
      site: params.site || "—",
      password: params.password,
      login_url: params.loginUrl,
    },
  });
  if (!ok) {
    const err = new Error("Invite email could not be sent.");
    err.status = 502;
    throw err;
  }
  return true;
}
