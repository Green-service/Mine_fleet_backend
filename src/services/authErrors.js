export function signInError(error) {
  let message = "The sign-in service is unavailable or misconfigured. Please contact Head Office.";
  let status = 503;
  if (error?.code === "invalid_credentials") {
    message = "Invalid email or password";
    status = 401;
  } else if (error?.code === "email_not_confirmed") {
    message = "Confirm your email before signing in. Check your inbox or contact Head Office.";
    status = 403;
  } else if (error?.code === "user_banned") {
    message = "This account is disabled. Contact Head Office.";
    status = 403;
  } else if (error?.status === 429) {
    message = "Too many sign-in attempts. Wait a few minutes and try again.";
    status = 429;
  }
  return Object.assign(new Error(message), { status });
}
