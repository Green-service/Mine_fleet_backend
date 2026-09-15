import { Router } from "express";
import {
  byMachine, byType, captureIssue, dailyReconciliation, getDiesel, getDieselRegisters, removeIssue, topConsumers, transactions, updateIssue,
} from "../services/dieselService.js";
import { mountCollection } from "./collectionRoutes.js";

export const dieselRouter = Router();

dieselRouter.get("/", async (req, res, next) => {
  try {
    res.json(await getDiesel(req.query));
  } catch (err) {
    next(err);
  }
});

dieselRouter.get("/registers", async (req, res, next) => {
  try {
    res.json(await getDieselRegisters(req.query));
  } catch (err) {
    next(err);
  }
});

dieselRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await captureIssue(req.body || {}, req.actor));
  } catch (err) {
    next(err);
  }
});

dieselRouter.patch("/:id", async (req, res, next) => {
  try {
    res.json(await updateIssue(req.params.id, req.body || {}, req.actor));
  } catch (err) {
    next(err);
  }
});

dieselRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await removeIssue(req.params.id, req.actor));
  } catch (err) {
    next(err);
  }
});

mountCollection(dieselRouter, "/by-machine", byMachine, { readOnly: true });
mountCollection(dieselRouter, "/transactions", transactions);
mountCollection(dieselRouter, "/by-type", byType, { readOnly: true });
mountCollection(dieselRouter, "/top-consumers", topConsumers, { readOnly: true });
mountCollection(dieselRouter, "/daily-reconciliation", dailyReconciliation);
