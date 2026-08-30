import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { router } from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/error.js";

const app = express();
app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json());
app.use("/api", router);
app.use(notFound);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`MPG API listening on http://localhost:${env.port}`);
});
