import { Router } from "express";
import {
  availability, getBreakdowns, inventory, listCriticalSpares, removeBreakdown, reportBreakdown, updateBreakdown,
} from "../services/breakdownsService.js";
import { mountCollection } from "./collectionRoutes.js";

export const breakdownsRouter = Router();

breakdownsRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getBreakdowns());
  } catch (err) {
    next(err);
  }
});

breakdownsRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await reportBreakdown(req.body || {}, req.actor));
  } catch (err) {
    next(err);
  }
});

breakdownsRouter.patch("/:id", async (req, res, next) => {
  try {
    res.json(await updateBreakdown(req.params.id, req.body || {}, req.actor));
  } catch (err) {
    next(err);
  }
});

breakdownsRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await removeBreakdown(req.params.id, req.actor));
  } catch (err) {
    next(err);
  }
});

breakdownsRouter.get("/critical-spares", async (_req, res, next) => {
  try {
    res.json(await listCriticalSpares());
  } catch (err) {
    next(err);
  }
});

mountCollection(breakdownsRouter, "/inventory", inventory);
mountCollection(breakdownsRouter, "/availability", availability, { readOnly: true });
