import test from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = "https://recovery-test.invalid";
process.env.SUPABASE_ANON_KEY = "test-key";
process.env.CLIENT_ORIGIN = "https://mpg-test.invalid";
const { requestPasswordReset, resetPassword } = await import("./passwordRecovery.js");
const { createAuthClient, supabase } = await import("../lib/supabase.js");

test("user auth sessions never reuse the database client or another user's client", () => {
  const first = createAuthClient();
  const second = createAuthClient();
  assert.notEqual(first, second);
  assert.notEqual(first, supabase);
});

function mockFetch(t, handler) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).origin, "https://recovery-test.invalid");
    return handler(new URL(url), options);
  };
  t.after(() => { globalThis.fetch = original; });
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const token = `${Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: "test-user", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.${Buffer.alloc(32).toString("base64url")}`;

test("validates input before contacting Supabase", async (t) => {
  mockFetch(t, () => assert.fail("Unexpected network request"));
  await assert.rejects(requestPasswordReset("bad-email"), /valid work email/);
  await assert.rejects(resetPassword({ password: "long-password" }), /invalid or expired/);
  await assert.rejects(resetPassword({ accessToken: token, refreshToken: "refresh", password: "short" }), /8 characters/);
});

test("requests an email with a fixed trusted redirect and neutral confirmation", async (t) => {
  mockFetch(t, (url, options) => {
    assert.equal(url.pathname, "/auth/v1/recover");
    assert.equal(url.searchParams.get("redirect_to"), "https://mpg-test.invalid/reset-password");
    assert.equal(JSON.parse(options.body).email, "operator@mpg.co.za");
    return json({});
  });
  assert.match((await requestPasswordReset(" Operator@mpg.co.za ")).message, /If an account exists/);
});

test("invalid session cannot update a password", async (t) => {
  mockFetch(t, (url, options) => {
    assert.equal(options.method, "GET");
    return json({ message: "Invalid token" }, 401);
  });
  await assert.rejects(resetPassword({ accessToken: token, refreshToken: "refresh", password: "new-password" }), /invalid or expired/);
});

test("updates the verified user's password and retires the recovery session", async (t) => {
  const methods = [];
  mockFetch(t, (url, options) => {
    methods.push(options.method);
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    if (options.method === "PUT") assert.equal(JSON.parse(options.body).password, "new-password");
    if (url.pathname.endsWith("/logout")) {
      assert.equal(url.searchParams.get("scope"), "local");
      return json({});
    }
    return json({ id: "test-user", email: "operator@mpg.co.za" });
  });
  assert.match((await resetPassword({ accessToken: token, refreshToken: "refresh", password: "new-password" })).message, /Password updated/);
  assert.deepEqual(methods, ["GET", "PUT", "POST"]);
});
