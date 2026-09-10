import { Router } from "express";
import {
  backlog, bookService, createWorkOrder, fullRegister, getMaintenance, listMachinesNeedingAttention,
  removeWorkOrder, servicePlanStatic, statusByGroup, updateWorkOrder,
} from "../services/maintenanceService.js";
import { mountCollection } from "./collectionRoutes.js";

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
    res.status(201).json(await bookService(req.body || {}, req.actor));
  } catch (err) {
    next(err);
  }
});

maintenanceRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await createWorkOrder(req.body || {}, req.actor));
  } catch (err) {
    next(err);
  }
});

maintenanceRouter.patch("/:id", async (req, res, next) => {
  try {
    res.json(await updateWorkOrder(req.params.id, req.body || {}, req.actor));
  } catch (err) {
    next(err);
  }
});

maintenanceRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await removeWorkOrder(req.params.id, req.actor));
  } catch (err) {
    next(err);
  }
});

maintenanceRouter.get("/attention-static", async (_req, res, next) => {
  try {
    res.json(await listMachinesNeedingAttention());
  } catch (err) {
    next(err);
  }
});

mountCollection(maintenanceRouter, "/full-register", fullRegister);
mountCollection(maintenanceRouter, "/status-by-group", statusByGroup, { readOnly: true });
mountCollection(maintenanceRouter, "/service-plan-static", servicePlanStatic, { readOnly: true });
mountCollection(maintenanceRouter, "/backlog", backlog);
