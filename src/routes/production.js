import { Router } from "express";
import {
  captureHour, captureShift, forecastDaily, forecastWeek, getBoard, getMachineHours, ggDaily, ggHours, ggWeek, ggWeekLegacy, blfDaily,
  removeHour, removeShift, updateHour, updateShift,
} from "../services/productionService.js";
import { mountCollection } from "./collectionRoutes.js";

export const productionRouter = Router();

productionRouter.get("/machine-hours", async (req, res, next) => {
  try { res.json(await getMachineHours(req.query)); } catch (error) { next(error); }
});

productionRouter.get("/gg-week", async (req, res, next) => {
  try { res.json(await ggWeek.list(req.query)); } catch (error) { next(error); }
});
productionRouter.all(["/gg-week", "/gg-week/:id"], (_req, res) => {
  res.status(405).json({ error: "Weekly tonnage is calculated from daily captures. Add, edit or delete the daily entry to change the week." });
});
mountCollection(productionRouter, "/gg-week-legacy", ggWeekLegacy, { readOnly: true });

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

productionRouter.post("/hours", async (req, res, next) => {
  try {
    res.status(201).json(await captureHour(req.body || {}));
  } catch (err) {
    next(err);
  }
});

productionRouter.patch("/hours/:id", async (req, res, next) => {
  try {
    res.json(await updateHour(req.params.id, req.body || {}));
  } catch (err) {
    next(err);
  }
});

productionRouter.delete("/hours/:id", async (req, res, next) => {
  try {
    res.json(await removeHour(req.params.id));
  } catch (err) {
    next(err);
  }
});

mountCollection(productionRouter, "/gg-daily", ggDaily);
mountCollection(productionRouter, "/forecast-daily", forecastDaily);
mountCollection(productionRouter, "/forecast-week", forecastWeek, { readOnly: true });
mountCollection(productionRouter, "/blf-daily", blfDaily);
mountCollection(productionRouter, "/gg-hours-static", ggHours, { readOnly: true });
