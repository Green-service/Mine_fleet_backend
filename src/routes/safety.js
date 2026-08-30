import { Router } from "express";
import { getSafety, removeSafety, reportSafety, updateSafety } from "../services/safetyService.js";

export const safetyRouter = Router();

safetyRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getSafety());
  } catch (err) {
    next(err);
  }
});

safetyRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await reportSafety(req.body || {}));
  } catch (err) {
    next(err);
  }
});

safetyRouter.patch("/:id", async (req, res, next) => {
  try {
    res.json(await updateSafety(req.params.id, req.body || {}));
  } catch (err) {
    next(err);
  }
});

safetyRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await removeSafety(req.params.id));
  } catch (err) {
    next(err);
  }
});
