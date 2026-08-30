import { Router } from "express";
import { captureShift, getBoard, removeShift, updateShift } from "../services/productionService.js";

export const productionRouter = Router();

productionRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getBoard());
  } catch (err) {
    next(err);
  }
});

productionRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await captureShift(req.body || {}));
  } catch (err) {
    next(err);
  }
});

productionRouter.patch("/:id", async (req, res, next) => {
  try {
    res.json(await updateShift(req.params.id, req.body || {}));
  } catch (err) {
    next(err);
  }
});

productionRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await removeShift(req.params.id));
  } catch (err) {
    next(err);
  }
});
