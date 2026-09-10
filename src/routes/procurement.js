import { Router } from "express";
import { createRequest, getProcurement } from "../services/procurementService.js";

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
