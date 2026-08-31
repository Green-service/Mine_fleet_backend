import { Router } from "express";
import { resolveActor } from "../middleware/actor.js";
import { captureIssue, getDiesel, removeIssue, updateIssue } from "../services/dieselService.js";

export const dieselRouter = Router();

dieselRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getDiesel());
  } catch (err) {
    next(err);
  }
});

dieselRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await captureIssue(req.body || {}, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});

dieselRouter.patch("/:id", async (req, res, next) => {
  try {
    res.json(await updateIssue(req.params.id, req.body || {}, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});

dieselRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await removeIssue(req.params.id, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});
