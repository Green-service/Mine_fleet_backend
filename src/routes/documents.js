import { Router } from "express";
import { createDocument, getDocuments, removeDocument } from "../services/documentsService.js";


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
    res.status(201).json(await createDocument(req.body || {}, req.actor));
  } catch (err) {
    next(err);
  }
});

documentsRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await removeDocument(req.params.id, req.actor));
  } catch (err) {
    next(err);
  }
});
