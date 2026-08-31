import { Router } from "express";
import { resolveActor } from "../middleware/actor.js";
import { addUnit, getFleet, removeUnit, updateUnit } from "../services/fleetService.js";

export const fleetRouter = Router();

fleetRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getFleet());
  } catch (err) {
    next(err);
  }
});

fleetRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await addUnit(req.body || {}, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});

fleetRouter.patch("/:id", async (req, res, next) => {
  try {
    res.json(await updateUnit(req.params.id, req.body || {}, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});

fleetRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await removeUnit(req.params.id, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});
