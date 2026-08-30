import { Router } from "express";
import { getOverview } from "../services/overviewService.js";

export const overviewRouter = Router();

overviewRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getOverview());
  } catch (err) {
    next(err);
  }
});
