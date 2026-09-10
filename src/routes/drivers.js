import { Router } from "express";
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
    res.status(201).json(await createDriver(req.body, req.actor));
  } catch (err) {
    next(err);
  }
});

driversRouter.patch("/:id", async (req, res, next) => {
  try {
    res.json(await updateDriver(req.params.id, req.body, req.actor));
  } catch (err) {
    next(err);
  }
});

driversRouter.post("/:id/assign", async (req, res, next) => {
  try {
    res.json(await assignDriver(req.params.id, req.body.assetId, req.actor));
  } catch (err) {
    next(err);
  }
});

driversRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await removeDriver(req.params.id, req.actor));
  } catch (err) {
    next(err);
  }
});
