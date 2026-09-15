import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";

// Keep this regression completely separate from configured accounts and data.
for (const key of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) process.env[key] = "";
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "mpg-demo-access-test-"));
process.env.MPG_RUNTIME_DIR = runtime;
const { router } = await import("../src/routes/index.js");
const { createRole, listRoles, listUsers, updateRole, removeRole, updateUser, revokeUser, inviteUser } = await import("../src/services/rolesService.js");
const { insertRow, readTable } = await import("../src/services/store.js");
const { loadActor } = await import("../src/services/profiles.js");
let server, base;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  const resolved = path.resolve(runtime);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith("mpg-demo-access-test-"));
  fs.rmSync(resolved, { recursive: true, force: true });
});

test("demo shell HR reads work and role edits persist through a fresh read", async () => {
  const response = await fetch(`${base}/hr`);
  assert.equal(response.status, 200, await response.clone().text());
  const hr = await response.json();
  assert.ok(Array.isArray(hr.employees));
  assert.ok(hr.roles.some((role) => role.slug === "driver"));
  assert.deepEqual(hr.users, [], "no fabricated demo accounts");

  const role = await createRole({ name: "Capture reviewer", modules: 2 });
  assert.ok((await listRoles()).some((row) => row.id === role.id));
  await updateRole(role.id, { name: "Shift reviewer", modules: 3 });
  assert.equal((await listRoles()).find((row) => row.id === role.id).name, "Shift reviewer");
  await removeRole(role.id);
  assert.ok(!(await listRoles()).some((row) => row.id === role.id));
});

test("local user reads use profile linkage and edits/revocation remain visible", async () => {
  const profile = await insertRow("profiles", { full_name: "Test operator", email: "operator@example.test", role_slug: "driver" }, []);
  await insertRow("app_users", { profile_id: profile.id, email: profile.email, role_slug: "driver", is_active: false }, []);
  assert.equal((await listUsers()).find((user) => user.id === profile.id).status, "Revoked");
  await updateUser(profile.id, { name: "Updated operator", site: "Belfast", status: "Active" });
  const saved = (await listUsers()).find((user) => user.id === profile.id);
  assert.equal(saved.name, "Updated operator");
  assert.equal(saved.site, "Belfast");
  assert.equal(saved.status, "Active");
  await revokeUser(profile.id);
  assert.equal((await listUsers()).find((user) => user.id === profile.id).status, "Revoked");
});

test("demo mode does not invent authenticated users or pretend to send invitations", async () => {
  assert.equal(await loadActor("demo-user"), null);
  const response = await fetch(`${base}/hr/roles`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Unauthorized role" }),
  });
  assert.equal(response.status, 401, "role permissions remain enforced");
  const beforeProfiles = await readTable("profiles", []);
  await assert.rejects(inviteUser({ name: "Invite test", email: "invite@example.test", role: "Driver", site: "Belfast" }), { status: 503 });
  assert.deepEqual(await readTable("profiles", []), beforeProfiles);
});
