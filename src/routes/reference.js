import { Router } from "express";
import { getReference } from "../services/referenceService.js";

export const referenceRouter = Router();

referenceRouter.get("/:page/:groupKey", async (req, res, next) => {
  try {
    res.json(await getReference(req.params.page, req.params.groupKey));
  } catch (err) {
    next(err);
  }
});
