import { Router } from "express";
import { createDocument, getDocuments, removeDocument } from "../services/documentsService.js";

import { resolveActor } from "../middleware/actor.js";

export const documentsRouter = Router();

documentsRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getDocuments());
  } catch (err) {
    next(err);
  }
});

documentsRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await createDocument(req.body || {}, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});

documentsRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await removeDocument(req.params.id, resolveActor(req)));
  } catch (err) {
    next(err);
  }
});
