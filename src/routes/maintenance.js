import { Router } from "express";
import { createWorkOrder, getMaintenance, removeWorkOrder, updateWorkOrder } from "../services/maintenanceService.js";

export const maintenanceRouter = Router();

maintenanceRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getMaintenance());
  } catch (err) {
    next(err);
  }
});

maintenanceRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await createWorkOrder(req.body || {}));
  } catch (err) {
    next(err);
  }
});

maintenanceRouter.patch("/:id", async (req, res, next) => {
  try {
    res.json(await updateWorkOrder(req.params.id, req.body || {}));
  } catch (err) {
    next(err);
  }
});

maintenanceRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await removeWorkOrder(req.params.id));
  } catch (err) {
    next(err);
  }
});
