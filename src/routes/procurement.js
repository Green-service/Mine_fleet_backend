import { Router } from "express";
import {
  createOrder, createRequest, getProcurement, removeOrder, removeRequest,
  updateOrder, updateRequest,
} from "../services/procurementService.js";

export const procurementRouter = Router();

procurementRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getProcurement());
  } catch (err) {
    next(err);
  }
});

procurementRouter.post("/requests", async (req, res, next) => {
  try {
    res.status(201).json(await createRequest(req.body || {}, req.actor));
  } catch (err) {
    next(err);
  }
});

procurementRouter.patch("/requests/:id", async (req, res, next) => {
  try {
    res.json(await updateRequest(req.params.id, req.body || {}));
  } catch (err) {
    next(err);
  }
});

procurementRouter.delete("/requests/:id", async (req, res, next) => {
  try {
    res.json(await removeRequest(req.params.id));
  } catch (err) {
    next(err);
  }
});

procurementRouter.post("/orders", async (req, res, next) => {
  try {
    res.status(201).json(await createOrder(req.body || {}, req.actor));
  } catch (err) {
    next(err);
  }
});

procurementRouter.patch("/orders/:id", async (req, res, next) => {
  try {
    res.json(await updateOrder(req.params.id, req.body || {}));
  } catch (err) {
    next(err);
  }
});

procurementRouter.delete("/orders/:id", async (req, res, next) => {
  try {
    res.json(await removeOrder(req.params.id));
  } catch (err) {
    next(err);
  }
});
