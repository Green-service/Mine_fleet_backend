import test from "node:test";
import assert from "node:assert/strict";
import { assertMatchingProject } from "../config/supabaseConfig.js";
import { signInError } from "./authErrors.js";

const key = (ref) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ ref })).toString("base64url")}.test`;

test("rejects keys from another Supabase project without exposing them", () => {
  assert.throws(() => assertMatchingProject("https://project-a.supabase.co", [key("project-b")]),
    (error) => error.status === 503 && /different projects/.test(error.message) && !error.message.includes(key("project-b")));
});

test("accepts matching legacy keys and opaque publishable keys", () => {
  assert.doesNotThrow(() => assertMatchingProject("https://project-a.supabase.co", [key("project-a"), "sb_publishable_test"]));
});

test("only invalid credentials produce the wrong-password message", () => {
  assert.equal(signInError({ code: "invalid_credentials" }).status, 401);
  for (const error of [{ status: 500 }, { status: 401, message: "Invalid API key" }, { code: "unexpected_failure" }, null]) {
    assert.equal(signInError(error).status, 503);
    assert.doesNotMatch(signInError(error).message, /Invalid email or password/);
  }
  assert.equal(signInError({ code: "email_not_confirmed" }).status, 403);
  assert.equal(signInError({ status: 429 }).status, 429);
});
