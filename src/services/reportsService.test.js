import test from "node:test";
import assert from "node:assert/strict";
import { createReportsService } from "./reportsService.js";
import { createReportStorage, validateReportFile, MAX_REPORT_BYTES } from "./reportFileStorage.js";

const content = Buffer.from("%PDF-1.4\nReport test\n%%EOF");
const input = { title: "Monthly report", business: "MPG Group", pack: "finance", fileName: "report.pdf", fileData: `data:application/pdf;base64,${content.toString("base64")}` };

test("report validation uses actual bytes and rejects unsupported, malformed and oversized files", () => {
  assert.equal(validateReportFile({ ...input, sizeBytes: 1 }).bytes.length, content.length);
  for (const changes of [
    { fileName: "../report.pdf" }, { fileName: "report.html" },
    { fileData: "https://example.invalid/file.pdf" }, { fileData: "data:application/pdf;base64," },
    { fileData: `data:application/pdf;base64,${Buffer.from("wrong file").toString("base64")}` },
    { fileData: `data:application/pdf;base64,${"A".repeat(Math.ceil(MAX_REPORT_BYTES / 3) * 4 + 201)}` },
  ]) assert.throws(() => validateReportFile({ ...input, ...changes }), { status: 400 });
  assert.equal(validateReportFile({ fileName: "budget.csv", fileData: `data:;base64,${Buffer.from("Month,Cost\nSep,100").toString("base64")}` }).mimeType, "text/csv");
});

test("reports preserve folder and company while listings exclude file bodies and storage paths", async () => {
  const saved = [];
  const service = createReportsService({
    readTable: async (table) => table === "report_files" ? saved : [],
    insertRow: async (_table, row) => { saved.push(row); return row; },
  }, createReportStorage(null));
  const file = await service.create(input, { name: "Finance user" });
  const other = await service.create({ ...input, pack: "company", business: "Other company" });
  assert.notEqual(file.id, other.id);
  assert.equal(file.uploadedBy, "Finance user");
  assert.equal(file.sizeBytes, content.length);
  const listing = await service.list();
  assert.equal(listing.files.length, 2);
  assert.equal(listing.files.find((row) => row.id === file.id).pack, "finance");
  assert.ok(!JSON.stringify(listing).includes("base64"));
  assert.ok(!("storage_path" in file));
  assert.equal((await service.access(file.id)).dataUrl, input.fileData);
  await assert.rejects(service.access("missing"), { status: 404 });
  await assert.rejects(service.create({ ...input, pack: "wrong" }), { status: 400 });
});

test("failed report metadata saves clean up uploaded objects and report the failure", async () => {
  const stored = { storage_path: "test/file.pdf" };
  const removed = [];
  const service = createReportsService({ insertRow: async () => { throw new Error("Database unavailable"); } }, {
    save: async () => stored, remove: async (row) => removed.push(row),
  });
  await assert.rejects(service.create(input), /Database unavailable/);
  assert.deepEqual(removed, [stored]);
});

test("Supabase reports use private storage and short-lived links and propagate upload errors", async () => {
  const calls = [];
  const storage = createReportStorage({ storage: { from: (bucket) => {
    assert.equal(bucket, "report-files");
    return {
      upload: async (...args) => { calls.push(args); return {}; },
      createSignedUrl: async (...args) => { calls.push(args); return { data: { signedUrl: "signed-file-url" } }; },
    };
  } } });
  const saved = await storage.save(validateReportFile(input), "id");
  assert.deepEqual(saved, { storage_path: "id/file.pdf" });
  const access = await storage.access({ ...saved, file_name: "report.pdf", mime_type: "application/pdf" }, true);
  assert.equal(access.url, "signed-file-url");
  assert.deepEqual(calls[1], ["id/file.pdf", 60, { download: "report.pdf" }]);
  assert.equal(calls[0][2].upsert, false);
  const failed = createReportStorage({ storage: { from: () => ({ upload: async () => ({ error: { message: "Bucket unavailable" } }) }) } });
  await assert.rejects(failed.save(validateReportFile(input), "id"), { status: 502 });
});
