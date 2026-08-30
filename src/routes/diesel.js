import { Router } from "express";
import { captureIssue, getDiesel, removeIssue, updateIssue } from "../services/dieselService.js";

export const dieselRouter = Router();

dieselRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getDiesel());
  } catch (err) {
    next(err);
  }
});

dieselRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await captureIssue(req.body || {}));
  } catch (err) {
    next(err);
  }
});

dieselRouter.patch("/:id", async (req, res, next) => {
  try {
    res.json(await updateIssue(req.params.id, req.body || {}));
  } catch (err) {
    next(err);
  }
});

dieselRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await removeIssue(req.params.id));
  } catch (err) {
    next(err);
  }
});
