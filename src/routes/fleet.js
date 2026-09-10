import { Router } from "express";
import { addUnit, equipmentSummary, getFleet, plantRegister, removeUnit, updateUnit } from "../services/fleetService.js";
import { mountCollection } from "./collectionRoutes.js";

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
    res.status(201).json(await addUnit(req.body || {}, req.actor));
  } catch (err) {
    next(err);
  }
});

fleetRouter.patch("/:id", async (req, res, next) => {
  try {
    res.json(await updateUnit(req.params.id, req.body || {}, req.actor));
  } catch (err) {
    next(err);
  }
});

fleetRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await removeUnit(req.params.id, req.actor));
  } catch (err) {
    next(err);
  }
});

mountCollection(fleetRouter, "/equipment-summary", equipmentSummary, { readOnly: true });
mountCollection(fleetRouter, "/plant-register", plantRegister, { readOnly: true });
