import { Router } from "express";
import { resolveActor } from "../middleware/actor.js";
import { assignDriver, createDriver, getDrivers, removeDriver, updateDriver } from "../services/driversService.js";

export const driversRouter = Router();

driversRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getDrivers());
  } catch (err) {
    next(err);
  }
});

driversRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await createDriver(req.body, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});

driversRouter.patch("/:id", async (req, res, next) => {
  try {
    res.json(await updateDriver(req.params.id, req.body, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});

driversRouter.post("/:id/assign", async (req, res, next) => {
  try {
    res.json(await assignDriver(req.params.id, req.body.assetId, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});

driversRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await removeDriver(req.params.id, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});
