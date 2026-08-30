import { Router } from "express";
import { getFinance } from "../services/financeService.js";

export const financeRouter = Router();

financeRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getFinance());
  } catch (err) {
    next(err);
  }
});
