import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { supabase } from "../lib/supabase.js";

const ASSET_PREFIX = "assets";

function bucketName() {
  return env.supabaseStorageBucket || "documents";
}

export function isPhotoRef(value) {
  return (
    typeof value === "string"
    && (value.startsWith("data:image/") || /^https?:\/\//i.test(value))
  );
}

export function publicStorageUrl(path) {
  const base = String(env.supabaseUrl || "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${bucketName()}/${path}`;
}

function storagePathFromUrl(url) {
  const marker = `/storage/v1/object/public/${bucketName()}/`;
  const text = String(url || "");
  const idx = text.indexOf(marker);
  if (idx < 0) return null;
  return text.slice(idx + marker.length);
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl).match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
  if (!match) return null;
  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  return { buffer, contentType, ext };
}

export async function resolveAssetPhotos(photos, assetId) {
  const limited = (Array.isArray(photos) ? photos : []).filter(isPhotoRef).slice(0, 6);
  if (!limited.length) return [];

  if (!supabase) {
    return limited.filter((item) => item.startsWith("data:image/"));
  }

  const folder = `${ASSET_PREFIX}/${assetId}`;
  const resolved = [];

  for (const photo of limited) {
    if (/^https?:\/\//i.test(photo)) {
      resolved.push(photo);
      continue;
    }

    const parsed = parseDataUrl(photo);
    if (!parsed) continue;

    const path = `${folder}/${randomUUID()}.${parsed.ext}`;
    const { error } = await supabase.storage.from(bucketName()).upload(path, parsed.buffer, {
      contentType: parsed.contentType,
      upsert: false,
    });

    if (error) {
      const err = new Error(`Photo upload failed: ${error.message}`);
      err.status = 502;
      throw err;
    }

    resolved.push(publicStorageUrl(path));
  }

  return resolved;
}

export async function deleteAssetPhotos(photos) {
  if (!supabase || !Array.isArray(photos)) return;

  const paths = photos
    .map((url) => storagePathFromUrl(url))
    .filter(Boolean);

  if (!paths.length) return;

  const { error } = await supabase.storage.from(bucketName()).remove(paths);
  if (error) {
    console.warn(`[storage] delete asset photos: ${error.message}`);
  }
}

function parseAnyDataUrl(dataUrl, fileName = "") {
  const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const part = String(fileName).split(".").pop()?.toLowerCase();
  const extFromName = part && part.length <= 6 ? part : null;
  const ext = extFromName || contentType.split("/")[1]?.replace("jpeg", "jpg") || "bin";
  return { buffer, contentType, ext };
}

export async function resolvePortfolioDocument(fileData, documentId, fileName, mimeType = "") {
  const dataUrl = String(fileData || "");
  if (!dataUrl.startsWith("data:")) return null;

  if (!supabase) return dataUrl;

  const parsed = parseAnyDataUrl(dataUrl, fileName);
  if (!parsed) return null;

  const safeName = String(fileName || `file.${parsed.ext}`).replace(/[^\w.\-]+/g, "_");
  const path = `portfolio/${documentId}/${randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(bucketName()).upload(path, parsed.buffer, {
    contentType: mimeType || parsed.contentType,
    upsert: false,
  });

  if (error) {
    const err = new Error(`Document upload failed: ${error.message}`);
    err.status = 502;
    throw err;
  }

  return publicStorageUrl(path);
}

export function storageStatus() {
  return {
    bucket: bucketName(),
    configured: Boolean(supabase),
  };
}
