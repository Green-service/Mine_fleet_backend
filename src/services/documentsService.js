import * as catalog from "../data/catalog.js";
import { deleteRow, insertRow, readTable } from "./store.js";
import { resolvePortfolioDocument } from "./storageService.js";
import { recordSystemEvent } from "./notifications.js";

const CATEGORIES = ["General", "Contracts", "Finance", "Compliance", "Insurance", "Property", "Fleet"];

function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  if (n >= 1000) return `${Math.round(n / 1000)} KB`;
  return `${n} B`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function toDocument(row) {
  return {
    id: row.id,
    title: row.title || row.file_name || row.fileName || "Document",
    business: row.business || "—",
    category: row.category || "General",
    fileName: row.file_name || row.fileName || "",
    fileUrl: row.file_url || row.fileUrl || "",
    mimeType: row.mime_type || row.mimeType || "",
    sizeBytes: Number(row.size_bytes ?? row.sizeBytes ?? 0),
    sizeLabel: formatSize(row.size_bytes ?? row.sizeBytes),
    uploadedAt: formatDate(row.created_at || row.uploadedAt),
    uploadedAtIso: row.created_at || row.uploadedAt || "",
  };
}

export async function getDocuments() {
  const rows = await readTable("portfolio_documents", catalog.portfolioDocuments);
  const documents = rows.map(toDocument).sort((a, b) => String(b.uploadedAtIso).localeCompare(String(a.uploadedAtIso)));
  const weekAgo = Date.now() - 7 * 86400000;
  const businessRows = await readTable("businesses", catalog.businesses);
  const businesses = businessRows.map((row) => row.name).filter(Boolean);
  return {
    documents,
    businesses,
    categories: CATEGORIES,
    kpis: {
      total: documents.length,
      recent: rows.filter((row) => {
        const date = new Date(row.created_at || row.uploadedAt);
        return !Number.isNaN(date.getTime()) && date.getTime() >= weekAgo;
      }).length,
      contracts: documents.filter((row) => row.category === "Contracts").length,
      compliance: documents.filter((row) => row.category === "Compliance").length,
    },
  };
}

export async function createDocument(body, actor = null) {
  const title = String(body.title || "").trim();
  const fileName = String(body.fileName || body.file_name || "").trim();
  const fileData = body.fileData || body.file_data || "";
  if (!title) {
    const err = new Error("Document title is required.");
    err.status = 400;
    throw err;
  }
  if (!fileName || !fileData) {
    const err = new Error("Choose a file to upload.");
    err.status = 400;
    throw err;
  }

  const id = crypto.randomUUID();
  const fileUrl = await resolvePortfolioDocument(fileData, id, fileName, body.mimeType || body.mime_type);
  if (!fileUrl) {
    const err = new Error("Could not store the uploaded file.");
    err.status = 400;
    throw err;
  }

  const businessRows = await readTable("businesses", catalog.businesses);
  const businessOptions = businessRows.map((row) => row.name).filter(Boolean);

  const payload = {
    id,
    title,
    business: String(body.business || businessOptions[0] || "").trim(),
    category: CATEGORIES.includes(body.category) ? body.category : "General",
    file_name: fileName,
    file_url: fileUrl,
    mime_type: String(body.mimeType || body.mime_type || "").trim(),
    size_bytes: Number(body.sizeBytes ?? body.size_bytes ?? 0),
    created_at: new Date().toISOString(),
  };

  const saved = await insertRow("portfolio_documents", payload, catalog.portfolioDocuments);
  const doc = toDocument(saved);
  await recordSystemEvent({
    title: "Document uploaded",
    detail: `${doc.title} · ${doc.business} · ${doc.category}`,
    kind: "compliance",
    actor,
    action: "uploaded a document",
    ctaPath: "/documents",
  });
  return doc;
}

export async function removeDocument(id, actor = null) {
  const rows = await readTable("portfolio_documents", catalog.portfolioDocuments);
  const previous = rows.find((row) => row.id === id);
  await deleteRow("portfolio_documents", id, catalog.portfolioDocuments);
  if (previous) {
    const doc = toDocument(previous);
    await recordSystemEvent({
      title: "Document removed",
      detail: `${doc.title} · ${doc.business}`,
      kind: "compliance",
      actor,
      action: "removed a document",
      ctaPath: "/documents",
    });
  }
  return { ok: true };
}
