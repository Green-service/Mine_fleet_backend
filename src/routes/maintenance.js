import { Router } from "express";
import { bookService, createWorkOrder, getMaintenance, removeWorkOrder, updateWorkOrder } from "../services/maintenanceService.js";
import { resolveActor } from "../middleware/actor.js";

export const maintenanceRouter = Router();

maintenanceRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getMaintenance());
  } catch (err) {
    next(err);
  }
});

maintenanceRouter.post("/book", async (req, res, next) => {
  try {
    res.status(201).json(await bookService(req.body || {}, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});

maintenanceRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await createWorkOrder(req.body || {}, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});

maintenanceRouter.patch("/:id", async (req, res, next) => {
  try {
    res.json(await updateWorkOrder(req.params.id, req.body || {}, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});

maintenanceRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await removeWorkOrder(req.params.id, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});
