import { Router } from "express";
import {
  businessMeta,
  createBusiness,
  listBusinesses,
  removeBusiness,
  updateBusiness,
} from "../services/businessesService.js";

import { resolveActor } from "../middleware/actor.js";

export const businessesRouter = Router();

businessesRouter.get("/meta", async (_req, res, next) => {
  try {
    res.json(businessMeta());
  } catch (err) {
    next(err);
  }
});

businessesRouter.get("/", async (_req, res, next) => {
  try {
    res.json({ businesses: await listBusinesses(), ...businessMeta() });
  } catch (err) {
    next(err);
  }
});

businessesRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await createBusiness(req.body || {}, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});

businessesRouter.patch("/:id", async (req, res, next) => {
  try {
    res.json(await updateBusiness(req.params.id, req.body || {}, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});

businessesRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await removeBusiness(req.params.id, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});
