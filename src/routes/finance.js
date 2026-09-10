import { Router } from "express";
import { costActions, getFinance } from "../services/financeService.js";
import { mountCollection } from "./collectionRoutes.js";

export const financeRouter = Router();

financeRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getFinance());
  } catch (err) {
    next(err);
  }
});

mountCollection(financeRouter, "/cost-actions", costActions);
