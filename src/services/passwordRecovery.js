import { env } from "../config/env.js";
import { createAuthClient } from "../lib/supabase.js";

function failure(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export async function requestPasswordReset(email) {
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw failure("Enter a valid work email.");
  }
  const client = createAuthClient();
  const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${env.clientOrigin.replace(/\/$/, "")}/reset-password`,
  });
  if (error) {
    if (error.status === 429) throw failure("Too many reset requests. Please wait before trying again.", 429);
    throw failure("Could not send the reset email. Please try again later.");
  }
  return { message: "If an account exists for this email, a password reset link will arrive shortly. Check your inbox and spam folder." };
}

export async function resetPassword({ accessToken, refreshToken, password } = {}) {
  if (typeof accessToken !== "string" || !accessToken || typeof refreshToken !== "string" || !refreshToken) {
    throw failure("This reset link is invalid or expired. Request a new link.");
  }
  if (typeof password !== "string" || password.length < 8) {
    throw failure("Use at least 8 characters for your new password.");
  }
  const client = createAuthClient();
  const { data, error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error || !data?.user) throw failure("This reset link is invalid or expired. Request a new link.");
  const { error: updateError } = await client.auth.updateUser({ password });
  if (updateError) throw failure(updateError.message || "Could not update your password. Request a new link.");
  // Retire the recovery session after use. Existing app access remains governed by profiles.
  await client.auth.signOut({ scope: "local" });
  return { message: "Password updated. Sign in with your new password." };
}
