import { createClient } from "@supabase/supabase-js";
import { env, usingSupabase } from "../config/env.js";
import { assertMatchingProject } from "../config/supabaseConfig.js";

// Trusted server-side client — uses the service_role key when available, so
// it bypasses RLS. Used for every DB read/write the API does on the app's behalf.
export const supabase = usingSupabase
  ? createClient(env.supabaseUrl, env.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

// Auth-only client, always the anon/publishable key — used specifically for
// user-facing auth calls (sign in, refresh, verify) so those behave exactly
// as they would from a browser, regardless of which key `supabase` above ends
// up using for DB access.
export function createAuthClient() {
  if (!usingSupabase) throw Object.assign(new Error("Sign-in is not configured on this server."), { status: 503 });
  assertMatchingProject(env.supabaseUrl, [env.supabaseKey, env.supabaseAnonKey]);
  return createClient(env.supabaseUrl, env.supabaseAnonKey || env.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: "implicit" },
  });
}
