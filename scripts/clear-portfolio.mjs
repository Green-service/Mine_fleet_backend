/**
 * Wipe portfolio demo rows from Supabase + local runtime JSON.
 * Run: npm run clear-portfolio
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, "server", ".env") });

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

if (!url || !key) {
  console.error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TABLES = [
  "business_transactions",
  "business_monthly_trend",
  "asset_logs",
  "diesel_issues",
  "portfolio_documents",
  "notifications",
  "activity_log",
  "drivers",
  "assets",
  "businesses",
  "production_shifts",
  "machine_hours",
  "equipment",
  "work_orders",
  "attention_machines",
  "service_plans",
  "breakdowns",
  "safety_actions",
  "incidents",
  "leave_requests",
  "claims",
  "purchase_orders",
  "purchase_requests",
  "machine_costs",
];

async function clearTable(table) {
  const { error, count } = await supabase.from(table).delete({ count: "exact" }).not("id", "is", null);
  if (error) throw new Error(error.message);
  console.log(`  cleared ${table} (${count ?? 0} rows)`);
}

async function main() {
  console.log("Clearing portfolio data from Supabase…");
  for (const table of TABLES) {
    try {
      await clearTable(table);
    } catch (err) {
      console.warn(`  skip ${table}: ${err.message}`);
    }
  }

  const runtimeDir = path.join(root, "server", "data", "runtime");
  if (fs.existsSync(runtimeDir)) {
    for (const file of fs.readdirSync(runtimeDir)) {
      if (file.endsWith(".json")) {
        fs.writeFileSync(path.join(runtimeDir, file), "[]\n", "utf8");
      }
    }
    console.log("Cleared local runtime JSON cache.");
  }

  console.log("Done. Restart the API server and hard-refresh the browser.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
