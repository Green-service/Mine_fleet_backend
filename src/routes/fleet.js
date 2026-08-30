import { Router } from "express";
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
    res.status(201).json(await addUnit(req.body || {}));
  } catch (err) {
    next(err);
  }
});

fleetRouter.patch("/:id", async (req, res, next) => {
  try {
    res.json(await updateUnit(req.params.id, req.body || {}));
  } catch (err) {
    next(err);
  }
});

fleetRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await removeUnit(req.params.id));
  } catch (err) {
    next(err);
  }
});
