import { Router } from "express";
import {
  businessMeta,
  createBusiness,
  listBusinesses,
  removeBusiness,
  updateBusiness,
} from "../services/businessesService.js";


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
    res.status(201).json(await createBusiness(req.body || {}, req.actor));
  } catch (err) {
    next(err);
  }
});

businessesRouter.patch("/:id", async (req, res, next) => {
  try {
    res.json(await updateBusiness(req.params.id, req.body || {}, req.actor));
  } catch (err) {
    next(err);
  }
});

businessesRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await removeBusiness(req.params.id, req.actor));
  } catch (err) {
    next(err);
  }
});
