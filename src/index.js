import express from "express";
import cors from "cors";
import { env, usingSupabase } from "./config/env.js";
import { router } from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/error.js";
import * as catalog from "./data/catalog.js";
import { hydrateCatalog } from "./services/persistStore.js";
import { readBusinessRows, syncBusinessCatalog } from "./services/businessesService.js";

if (!usingSupabase) {
  hydrateCatalog(catalog);
}
syncBusinessCatalog(await readBusinessRows());

const app = express();
const corsOrigins = new Set(
  [env.clientOrigin, "https://localhost", "capacitor://localhost", "http://localhost"].filter(Boolean),
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || corsOrigins.has(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "20mb" }));
app.use("/api", router);
app.use(notFound);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`BRAINSTAK API listening on http://localhost:${env.port}`);
  console.log(usingSupabase ? `Supabase connected: ${env.supabaseUrl}` : "Supabase unset — local JSON fallback only");
  console.log(env.emailjsServiceId ? `Invite mail: EmailJS ${env.emailjsServiceId}` : "Invite mail unset");
});
