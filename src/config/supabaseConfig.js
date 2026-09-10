// Decode only for configuration diagnostics, never to authenticate a user.
export function assertMatchingProject(url, keys) {
  const host = new URL(url).hostname;
  const project = host.endsWith(".supabase.co") ? host.split(".")[0] : null;
  for (const key of keys.filter(Boolean)) {
    if (!project || !key.startsWith("eyJ")) continue;
    let payload;
    try { payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()); }
    catch { throw Object.assign(new Error("The server has an invalid Supabase API key. Check its configuration."), { status: 503 }); }
    if (payload.ref && payload.ref !== project) {
      throw Object.assign(new Error("The server's Supabase URL and API keys belong to different projects. Correct the server configuration."), { status: 503 });
    }
  }
}
