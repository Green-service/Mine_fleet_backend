import { Router } from "express";
import { reports } from "../services/reportsService.js";

export const reportsRouter = Router();
reportsRouter.get("/", async (_req, res, next) => {
  try { res.json(await reports.list()); } catch (error) { next(error); }
});
reportsRouter.post("/files", async (req, res, next) => {
  try { res.status(201).json(await reports.create(req.body || {}, req.actor)); } catch (error) { next(error); }
});
reportsRouter.get("/files/:id/access", async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await reports.access(req.params.id, req.query.download === "1"));
  } catch (error) { next(error); }
});
