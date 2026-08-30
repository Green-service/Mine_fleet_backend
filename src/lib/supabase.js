import { createClient } from "@supabase/supabase-js";
import { env, usingSupabase } from "../config/env.js";

export const supabase = usingSupabase
  ? createClient(env.supabaseUrl, env.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;
