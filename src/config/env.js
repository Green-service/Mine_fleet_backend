import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, "server", ".env") });

export const env = {
  port: Number(process.env.PORT || 5050),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseKey:
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "",
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET || "documents",
  demoEmail: process.env.DEMO_EMAIL || "clintonbonganikhoza@gmail.com",
  demoPassword: process.env.DEMO_PASSWORD || "salvation",
  emailjsServiceId: process.env.EMAILJS_SERVICE_ID || "",
  emailjsTemplateId: process.env.EMAILJS_TEMPLATE_ID || "",
  emailjsPublicKey: process.env.EMAILJS_PUBLIC_KEY || "",
  emailjsPrivateKey: process.env.EMAILJS_PRIVATE_KEY || "",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  googleCallbackUrl:
    process.env.GOOGLE_OAUTH_CALLBACK ||
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
      ? `${String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/$/, "")}/auth/v1/callback`
      : ""),
};

export const usingSupabase = Boolean(env.supabaseUrl && env.supabaseKey);
