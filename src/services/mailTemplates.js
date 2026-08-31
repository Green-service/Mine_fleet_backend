/** EmailJS / HTML template for BRAINSTAK system notifications. */
export function buildNotificationEmailHtml({
  title,
  message,
  actor = "A team member",
  action = "updated a record",
  module = "BRAINSTAK",
  when = new Date().toLocaleString("en-GB"),
  ctaUrl = "",
}) {
  const safe = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const lines = String(message || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safe(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f5f9;font-family:IBM Plex Sans,Segoe UI,Arial,sans-serif;color:#151820;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e6e8ee;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:20px 22px 12px;border-bottom:1px solid #eef0f5;">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#6d7484;">${safe(module)}</div>
              <h1 style="margin:8px 0 0;font-size:20px;line-height:1.3;letter-spacing:-0.02em;">${safe(title)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 22px;">
              <p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#3d4452;">
                <strong>${safe(actor)}</strong> ${safe(action)}.
              </p>
              ${lines
                .map(
                  (line) =>
                    `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#6d7484;">${safe(line)}</p>`,
                )
                .join("")}
              <p style="margin:16px 0 0;font-size:12px;color:#8b93a3;">${safe(when)}</p>
              ${
                ctaUrl
                  ? `<p style="margin:18px 0 0;"><a href="${safe(ctaUrl)}" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#2f6fed;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;">Open in BRAINSTAK</a></p>`
                  : ""
              }
            </td>
          </tr>
          <tr>
            <td style="padding:14px 22px 18px;background:#fafbfc;border-top:1px solid #eef0f5;font-size:11px;color:#8b93a3;">
              You are receiving this because you are registered on BRAINSTAK.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildNotificationEmailText({ title, message, actor = "A team member", action = "updated a record" }) {
  return [title, "", `${actor} ${action}.`, "", message, ""].filter(Boolean).join("\n");
}
