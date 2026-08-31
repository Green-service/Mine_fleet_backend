import { Router } from "express";
import { resolveActor } from "../middleware/actor.js";
import { getBreakdowns, removeBreakdown, reportBreakdown, updateBreakdown } from "../services/breakdownsService.js";

export const breakdownsRouter = Router();

breakdownsRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getBreakdowns());
  } catch (err) {
    next(err);
  }
});

breakdownsRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await reportBreakdown(req.body || {}, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});

breakdownsRouter.patch("/:id", async (req, res, next) => {
  try {
    res.json(await updateBreakdown(req.params.id, req.body || {}, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});

breakdownsRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await removeBreakdown(req.params.id, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});
