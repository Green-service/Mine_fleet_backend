import { Router } from "express";
import {
  getSafety, individualActions, listVflObservations, monthlyReport, performance, removeSafety, reportSafety,
  submitVflObservation, updateSafety,
} from "../services/safetyService.js";
import { mountCollection } from "./collectionRoutes.js";
import { requirePermission } from "../middleware/requirePermission.js";

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
    res.status(201).json(await reportSafety(req.body || {}, req.actor));
  } catch (err) {
    next(err);
  }
});

safetyRouter.patch("/:id", async (req, res, next) => {
  try {
    res.json(await updateSafety(req.params.id, req.body || {}, req.actor));
  } catch (err) {
    next(err);
  }
});

safetyRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await removeSafety(req.params.id, req.actor));
  } catch (err) {
    next(err);
  }
});

mountCollection(safetyRouter, "/performance", performance, { readOnly: true });
mountCollection(safetyRouter, "/monthly-report", monthlyReport, { readOnly: true });
mountCollection(safetyRouter, "/individual", individualActions);

safetyRouter.post("/vfl", async (req, res, next) => {
  try {
    res.status(201).json(await submitVflObservation(req.body || {}, req.actor));
  } catch (err) {
    next(err);
  }
});

safetyRouter.get("/vfl", requirePermission("safety", "approve"), async (_req, res, next) => {
  try {
    res.json(await listVflObservations());
  } catch (err) {
    next(err);
  }
});
