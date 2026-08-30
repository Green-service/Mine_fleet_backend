import { env } from "../config/env.js";

function inviteMessage({ name, email, role, site, password, loginUrl }) {
  return [
    `Good day ${name},`,
    `You have been invited to MPG Operations as ${role}${site ? ` at ${site}` : ""}.`,
    `Sign in at ${loginUrl}`,
    `Work email: ${email}`,
    `Temporary password: ${password}`,
    "Ask Head Office to rotate this password after your first sign-in.",
  ].join("\n\n");
}

export async function sendInviteEmail(params) {
  if (!env.emailjsServiceId || !env.emailjsTemplateId || !env.emailjsPublicKey) {
    const err = new Error("Invite email is not configured on the API.");
    err.status = 503;
    throw err;
  }

  const message = inviteMessage(params);
  const body = {
    service_id: env.emailjsServiceId,
    template_id: env.emailjsTemplateId,
    user_id: env.emailjsPublicKey,
    template_params: {
      to_email: params.email,
      email: params.email,
      user_email: params.email,
      to_name: params.name,
      name: params.name,
      from_name: "MPG Operations",
      reply_to: env.demoEmail,
      role: params.role,
      site: params.site || "—",
      password: params.password,
      login_url: params.loginUrl,
      title: "MPG Operations invite",
      message,
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
    const err = new Error(text.replace(/^"|"$/g, "") || "Invite email could not be sent.");
    err.status = 502;
    throw err;
  }
  return true;
}
