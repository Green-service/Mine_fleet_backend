import { Router } from "express";
import { createLog, getLogData, removeLog, updateLog } from "../services/logService.js";
import { resolveActor } from "../middleware/actor.js";

export const logRouter = Router();

logRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getLogData());
  } catch (err) {
    next(err);
  }
});

logRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await createLog(req.body, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});

logRouter.patch("/:id", async (req, res, next) => {
  try {
    res.json(await updateLog(req.params.id, req.body, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});

logRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await removeLog(req.params.id, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});
