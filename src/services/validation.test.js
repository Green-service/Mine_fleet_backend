import test from "node:test";
import assert from "node:assert/strict";
import { isoDate, numberValue, validateInput, validatePayload } from "./validation.js";

test("calendar validation accepts ISO and legacy dates but rejects impossible dates", () => {
  assert.equal(isoDate("2028-02-29"), "2028-02-29");
  assert.equal(isoDate("12/09/2026"), "2026-09-12");
  assert.equal(isoDate("12 Sep 2026"), "2026-09-12");
  for (const date of ["2026-02-29", "31/04/2026", "2026-13-01", "yesterday", ""]) {
    assert.throws(() => isoDate(date), (error) => error.status === 400);
  }
  assert.equal(isoDate("", "Date", { required: false }), null);
});

test("form numeric validation rejects invalid and negative tonnages before mapping", () => {
  for (const value of ["abc", -1, Infinity, {}, "10 litres"]) {
    assert.throws(() => validateInput("production_forecast_daily", { productLoading: value }), (error) => error.status === 400);
  }
  assert.equal(numberValue("12.5", "Hours"), 12.5);
  assert.throws(() => numberValue(101, "Health", { max: 100 }), /between 0 and 100/);
});

test("payload validation enforces meter order, times and leave date ranges", () => {
  assert.throws(() => validatePayload("diesel_transactions", { work_date: "2026-09-12", machine: "CMPG044", site: "Grootegeluk", opening: 20, closing: 10 }), /Closing meter/);
  assert.throws(() => validatePayload("diesel_transactions", { work_date: "2026-09-12", machine: "CMPG044", site: "Grootegeluk", work_time: "25:00" }), /valid time/);
  assert.throws(() => validatePayload("leave_requests", { employee: "Operator", from_date: "2026-09-12", to_date: "2026-09-11" }), /end date/);
  assert.equal(validatePayload("employees", { employee_no: "MPG001", full_name: "Operator", hourly_rate: "15" }).hourly_rate, 15);
});

test("partial relationship updates do not require unrelated fields", () => {
  assert.deepEqual(validatePayload("assets", { assigned_driver_id: null }, { partial: true }), { assigned_driver_id: null });
  assert.deepEqual(validatePayload("employees", { status: "Present" }, { partial: true }), { status: "Present" });
});
