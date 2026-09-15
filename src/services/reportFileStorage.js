import { supabase } from "../lib/supabase.js";
import { invalid } from "./validation.js";

export const REPORT_BUCKET = "report-files";
export const MAX_REPORT_BYTES = 8_000_000;
const TYPES = {
  pdf: "application/pdf", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv", txt: "text/plain", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
};

export function validateReportFile(body) {
  const name = typeof body.fileName === "string" ? body.fileName.trim() : "";
  if (!name || name.length > 255 || /[\\/\x00-\x1f]/.test(name)) throw invalid("Choose a filename of up to 255 characters without path separators.");
  const extension = name.split(".").pop().toLowerCase();
  const mimeType = TYPES[extension];
  if (!mimeType) throw invalid("Choose a PDF, Office, CSV, text or image file.");
  if (typeof body.fileData !== "string" || body.fileData.length > Math.ceil(MAX_REPORT_BYTES / 3) * 4 + 200) throw invalid("Each file must be 8 MB or smaller.");
  const match = /^data:[^;,]*;base64,([A-Za-z0-9+/]+={0,2})$/.exec(body.fileData);
  if (!match) throw invalid("The file could not be read. Choose it again.");
  const bytes = Buffer.from(match[1], "base64");
  if (!bytes.length || bytes.length > MAX_REPORT_BYTES || bytes.toString("base64") !== match[1]) throw invalid("The file is empty, invalid or larger than 8 MB.");
  const starts = (hex) => bytes.subarray(0, hex.length / 2).equals(Buffer.from(hex, "hex"));
  const valid = extension === "pdf" ? bytes.subarray(0, 5).toString() === "%PDF-"
    : extension === "png" ? starts("89504e470d0a1a0a")
      : ["jpg", "jpeg"].includes(extension) ? starts("ffd8ff")
        : extension === "webp" ? bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP"
          : ["docx", "xlsx", "pptx"].includes(extension) ? starts("504b0304")
            : ["doc", "xls", "ppt"].includes(extension) ? starts("d0cf11e0a1b11ae1")
              : !bytes.includes(0);
  if (!valid) throw invalid("The file contents do not match its extension.");
  return { name, extension, mimeType, bytes, dataUrl: `data:${mimeType};base64,${match[1]}` };
}

function storageError(error) {
  return Object.assign(new Error(`Report file storage failed: ${error.message}`), { status: 502 });
}

// A separate private bucket keeps report URLs out of the public document library.
export function createReportStorage(client = supabase) {
  const bucket = () => client.storage.from(REPORT_BUCKET);
  return {
    async save(file, id) {
      if (!client) return { data_url: file.dataUrl };
      const storage_path = `${id}/file.${file.extension}`;
      const { error } = await bucket().upload(storage_path, file.bytes, { contentType: file.mimeType, upsert: false });
      if (error) throw storageError(error);
      return { storage_path };
    },
    async access(row, download) {
      if (!client) return { dataUrl: row.data_url, fileName: row.file_name, mimeType: row.mime_type };
      const { data, error } = await bucket().createSignedUrl(row.storage_path, 60, download ? { download: row.file_name } : {});
      if (error || !data?.signedUrl) throw storageError(error || { message: "Could not open file." });
      return { url: data.signedUrl, fileName: row.file_name, mimeType: row.mime_type };
    },
    async remove(row) {
      if (!client || !row.storage_path) return;
      const { error } = await bucket().remove([row.storage_path]);
      if (error) throw storageError(error);
    },
  };
}
