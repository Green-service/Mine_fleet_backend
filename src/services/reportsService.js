import { randomUUID } from "node:crypto";
import * as catalog from "../data/catalog.js";
import * as store from "./store.js";
import { invalid } from "./validation.js";
import { createReportStorage, validateReportFile } from "./reportFileStorage.js";

export const REPORT_PACKS = [
  { id: "company", title: "Company documents", blurb: "Company records, correspondence and supporting documents." },
  { id: "finance", title: "Finance documents", blurb: "Financial statements, budgets, invoices and supporting schedules." },
  { id: "exec", title: "Executive monthly report", blurb: "Availability, production, cost and SHEQ on one pack." },
  { id: "eng", title: "Engineering performance", blurb: "PM compliance, backlog and return-to-service." },
  { id: "prod", title: "Daily production report", blurb: "GG and Medupi target versus actual with challenges." },
  { id: "cost", title: "Machine cost report", blurb: "Top cost drivers by fleet number." },
  { id: "fuel", title: "Fuel consumption report", blurb: "Litres, L/hr and reconciliation exceptions." },
  { id: "sheq", title: "SHEQ performance report", blurb: "LTI, PTOs, actions and contractor files." },
  { id: "spares", title: "Critical spares report", blurb: "Stock-outs tied to open breakdowns." },
  { id: "supplier", title: "Supplier performance", blurb: "PO ageing, delivery and close-out." },
];
export const REPORT_SITES = ["Grootegeluk", "Medupi", "Belfast"];

function toFile(row) {
  return { id: row.id, title: row.title, site: row.site || row.business || REPORT_SITES[0], business: row.business, pack: row.pack,
    fileName: row.file_name, mimeType: row.mime_type, sizeBytes: row.size_bytes,
    uploadedAt: row.created_at, uploadedBy: row.uploaded_by || "" };
}

export function createReportsService(dataStore = store, storage = createReportStorage()) {
  async function find(id) {
    const row = (await dataStore.readTable("report_files", [])).find((item) => item.id === id);
    if (!row) throw Object.assign(new Error("Report file not found."), { status: 404 });
    return row;
  }
  return {
    async list() {
      const rows = await dataStore.readTable("report_files", []);
      return { packs: REPORT_PACKS, sites: REPORT_SITES,
        files: rows.map(toFile).sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt))) };
    },
    async create(body, actor) {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const site = typeof body.site === "string" ? body.site.trim() : REPORT_SITES[0];
      if (!title || title.length > 200) throw invalid("Enter a file title of up to 200 characters.");
      if (!REPORT_SITES.includes(site)) throw invalid("Select a site.");
      if (!REPORT_PACKS.some((pack) => pack.id === body.pack)) throw invalid("Select a report folder.");
      const file = validateReportFile(body);
      const id = randomUUID();
      const stored = await storage.save(file, id);
      try {
        return toFile(await dataStore.insertRow("report_files", { id, title, site, business: body.business || site, pack: body.pack,
          file_name: file.name, mime_type: file.mimeType, size_bytes: file.bytes.length,
          uploaded_by: actor?.name || "", created_at: new Date().toISOString(), ...stored }, []));
      } catch (error) {
        try { await storage.remove(stored); } catch (cleanupError) { console.warn("Report upload cleanup failed:", cleanupError.message); }
        throw error;
      }
    },
    async access(id, download = false) { return storage.access(await find(id), download); },
  };
}

export const reports = createReportsService();
