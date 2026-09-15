import test from "node:test";
import assert from "node:assert/strict";
import { validateFuelSlip } from "./fuelSlipService.js";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";

test("fuel slips are optional and support PNG, JPG and PDF", () => {
  assert.equal(validateFuelSlip(undefined), null);
  assert.equal(validateFuelSlip({ name: "receipt.png", data: png }).type, "image/png");
  for (const [type, header] of [["application/pdf", Buffer.from("%PDF-1.4\n")], ["image/jpeg", Buffer.from([255, 216, 255, 224])]]) {
    assert.equal(validateFuelSlip({ name: "receipt", data: `data:${type};base64,${header.toString("base64")}` }).type, type);
  }
});

test("fuel slips reject invalid content, unsupported types and oversized uploads", () => {
  for (const data of ["https://example.invalid/slip.pdf", "data:text/html;base64,PGgxPg==", "data:image/png;base64,AAAA", "data:application/pdf;base64,%%%", "data:image/png;base64,", `data:image/png;base64,${Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64")}`]) {
    assert.throws(() => validateFuelSlip({ name: "receipt", data }), { status: 400 });
  }
  assert.throws(() => validateFuelSlip({ name: "", data: png }), { status: 400 });
});
