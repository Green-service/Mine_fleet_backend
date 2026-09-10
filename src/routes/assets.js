import { Router } from "express";
import {
  createAsset,
  getAssetBin,
  getAssetById,
  getAssets,
  removeAsset,
  restoreAsset,
  updateAsset,
} from "../services/assetsService.js";

export const assetsRouter = Router();

assetsRouter.get("/bin", async (_req, res, next) => {
  try {
    res.json(await getAssetBin());
  } catch (err) {
    next(err);
  }
});

assetsRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getAssets());
  } catch (err) {
    next(err);
  }
});

assetsRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await createAsset(req.body, req.actor));
  } catch (err) {
    next(err);
  }
});

assetsRouter.post("/:id/restore", async (req, res, next) => {
  try {
    res.json(await restoreAsset(req.params.id, req.actor));
  } catch (err) {
    next(err);
  }
});

assetsRouter.get("/:id", async (req, res, next) => {
  try {
    res.json(await getAssetById(req.params.id));
  } catch (err) {
    next(err);
  }
});

assetsRouter.patch("/:id", async (req, res, next) => {
  try {
    res.json(await updateAsset(req.params.id, req.body, req.actor));
  } catch (err) {
    next(err);
  }
});

assetsRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await removeAsset(req.params.id, req.actor));
  } catch (err) {
    next(err);
  }
});
