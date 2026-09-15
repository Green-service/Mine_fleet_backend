import { invalid } from "./validation.js";
import { resolvePortfolioDocument } from "./storageService.js";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };

export function validateFuelSlip(slip) {
  if (slip == null) return null;
  const name = typeof slip.name === "string" ? slip.name.trim() : "";
  if (!name || name.length > 255) throw invalid("Enter a fuel slip filename of up to 255 characters.");
  if (typeof slip.data !== "string" || slip.data.length > Math.ceil(MAX_BYTES / 3) * 4 + 64) throw invalid("The fuel slip must be no larger than 5 MB.");
  const match = /^data:(image\/jpeg|image\/png|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(slip.data);
  if (!match) throw invalid("Choose a JPG, PNG or PDF fuel slip.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_BYTES || bytes.toString("base64") !== match[2]) throw invalid("The fuel slip is empty, too large or invalid.");
  const type = match[1];
  const validHeader = type === "application/pdf" ? bytes.subarray(0, 5).toString() === "%PDF-"
    : type === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!validHeader) throw invalid("The fuel slip contents do not match its file type.");
  return { name, data: slip.data, type, extension: TYPES[type] };
}

export async function storeFuelSlip(slip, fillId) {
  const file = validateFuelSlip(slip);
  if (!file) return {};
  const url = await resolvePortfolioDocument(file.data, fillId, `fuel-slip.${file.extension}`, file.type);
  if (!url) throw invalid("Could not store the fuel slip.");
  return { slip_url: url, slip_name: file.name };
}
