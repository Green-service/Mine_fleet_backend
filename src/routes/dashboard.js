import { Router } from "express";
import { getDashboardKpis, getPriorityAlerts } from "../services/dashboardService.js";

export const dashboardRouter = Router();

dashboardRouter.get("/kpis", async (_req, res, next) => {
  try {
    res.json(await getDashboardKpis());
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/alerts", async (_req, res, next) => {
  try {
    res.json(await getPriorityAlerts());
  } catch (err) {
    next(err);
  }
});
