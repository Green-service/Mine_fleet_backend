import { Router } from "express";
import { costActions, createMachine, getFinance, removeMachine, updateMachine } from "../services/financeService.js";
import { mountCollection } from "./collectionRoutes.js";

export const financeRouter = Router();

financeRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getFinance());
  } catch (err) {
    next(err);
  }
});

financeRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await createMachine(req.body || {}));
  } catch (err) {
    next(err);
  }
});

financeRouter.patch("/:id", async (req, res, next) => {
  try {
    res.json(await updateMachine(req.params.id, req.body || {}));
  } catch (err) {
    next(err);
  }
});

financeRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await removeMachine(req.params.id));
  } catch (err) {
    next(err);
  }
});

mountCollection(financeRouter, "/cost-actions", costActions);
