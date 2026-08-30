import express from "express";
import cors from "cors";
import { env, usingSupabase } from "./config/env.js";
import { router } from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/error.js";
import * as catalog from "./data/catalog.js";
import { hydrateCatalog } from "./services/persistStore.js";

hydrateCatalog(catalog);

const app = express();
app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json());
app.use("/api", router);
app.use(notFound);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`MPG API listening on http://localhost:${env.port}`);
  console.log(usingSupabase ? `Supabase connected: ${env.supabaseUrl}` : "Supabase unset — serving demo data");
  console.log(env.emailjsServiceId ? `Invite mail: EmailJS ${env.emailjsServiceId}` : "Invite mail unset");
});
